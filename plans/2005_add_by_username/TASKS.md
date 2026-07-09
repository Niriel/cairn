# Tasks

Sub-step 2005 of `2000_username_identity`: swap the invite/circle add-key from
e-mail to username, and render `@username` wherever a person is shown. Builds on
2001's `profiles.username` (`NOT NULL`, `^[A-Za-z0-9]{3,30}$`, unique on
`lower(username)`) and 2003's `resolve_username` + open registration.

## Reference skills and docs

- **`docs/invites.md`** — the send-invitation check sequence and the "What
  blocked invites look like" anti-enumeration list; the RPC sketches Phase 0
  rewrites to username-keyed.
- **`docs/circles.md`** — the one-directional, invisible circle model; the mutual
  add path (both directed rows) that `add_circle_by_username` must preserve.
- **`docs/data-model.md`** — `profiles.username`, `resolve_username`, and the
  `invitations` schema.
- **`docs/ui.md`** — "Where CSS lives: layout local, visual global"; the
  `.identity-name` role the new `.identity-handle` sits beside; TopBar / button /
  form conventions.
- **`docs/testing.md`** — three test layers; pgTAP needs positive **and** negative
  cases for any policy/RPC.
- **`docs/frontend-layout.md`** — lib tier split, filename rules, mock placement.
- **`db/tests/resolve_username.sql`** — the fixture idiom for seeding usernames
  onto the Alice/Bob/Carol rows (`UPDATE public.profiles SET username = …`).
- **`design/cairn-invite-screens.jsx`** (invite picker 988–1138, circle screen
  534–698, profile sheet 794–952) and **`design/cairn-screens.jsx`** (members
  1914–2006, item panel 1023–1152) — layout references.

## Phase 0 — reconcile docs

### [x] 0.1 Rewrite `docs/invites.md` + `docs/circles.md` from e-mail-add to username-add

**Created:** 2026-07-09T09:46:23Z
**Completed:** 2026-07-09T10:31:03Z

**Why:** Both docs carry a 2001 forward-note deferring the add-by-e-mail→username
mechanics to "step 20" (`invites.md:66`, `circles.md:49`); 2005 resolves them.
The docs must describe the shipped design before code lands, so downstream tasks
and later sub-plans reference a correct spec (parent R12 pattern).

**Prerequisites:** None.

**Decisions:**

- **Username-add replaces e-mail-add.** Rewrite the `add_circle_by_email` sketch
  → `add_circle_by_username(p_username text)` (resolve against `profiles`, raise
  `'no such user'`, mutual two-row block-permitting upsert unchanged). Rewrite the
  `send_invitation` sketch to `send_invitation(p_list_id, p_username, p_user_id)`
  resolving `p_username` against `profiles`, with **no unregistered branch**.
- **Truthful miss split (parent R6/R10).** In "What `invite_policy` and blocks
  check, in order", step 2 becomes "resolve username → id; raise `'no such user'`
  on a miss (username existence is public)." In "What blocked invites look like",
  **move "Bob doesn't exist as a Cairn user" out** of the generic bucket — it is
  now a truthful, distinct error — while block / `nobody` / `circle`-not-in-circle
  stay merged under the generic "Couldn't send invite".
- **Reconcile the two anti-enumeration rationale passages.** Beyond the bucket
  list, `invites.md` argues the old stance in prose that now contradicts R3:
  (a) the "Anti-enumeration" note and its follow-up (`invites.md:130`, `:136`)
  claim Alice "cannot … learn from the error whether Bob exists" — untrue for a
  username, which is public; and (b) the subsection **"Why `add_circle_by_email`
  is allowed to raise on an unregistered address"** (`invites.md:323`) frames
  `send_invitation` as silently swallowing _every_ failure, which no longer holds
  once it raises `'no such user'` on a miss. Rewrite both: rename the function to
  `add_circle_by_username`, and recast the trade-off as "both paths may be
  truthful about _existence_ because usernames are public, while block/policy
  outcomes stay merged behind the generic string."
- **Correct the never-built prose.** The "Email path" section (`invites.md:155-159`)
  describes a magic-link signup + convert-at-sign-up flow that **was never
  implemented** — there is no mail send on the invite path and nothing converts a
  `target_email` row at signup. Reconcile it to reality (e-mail was only an
  *identifier*; an unmatched address produced an inert row), do **not** port the
  fiction to username. Rewrite the "Inviting by e-mail vs circle vs co-member"
  section: the third picker section is **By username**. Update the pending-invite
  cap `target_email` carve-out (`:174-178`) — moot now the column is going.
- **`circles.md`:** "The email-add path" → "The username-add path" (mechanics +
  the mutual outcome unchanged); "In the app" → Settings → Privacy → Your circle →
  **Add by username**. Resolve the line-49 forward-note. Sweep the scattered
  add-by-e-mail references too — `:12`, `:62`, the **`:101` RLS description that
  names `add_circle_by_email`** (rename it), `:110`, `:112`, `:118` — don't rely
  on the step-3 re-read alone to catch them.
- Drop `target_email` from the `invitations` schema block in `invites.md` and flip
  `target_user_id` to `NOT NULL` (the DDL change lands in Task 1.1).

**Files:**

- `docs/invites.md` (modify)
- `docs/circles.md` (modify)

**Steps:**

1. Rewrite the `invites.md` RPC sketches, check sequence, blocked-invite list,
   e-mail-path prose, picker sections, cap carve-out, and `invitations` schema
   block per Decisions.
2. Rewrite the `circles.md` add-path section, "In the app" bullet, and resolve
   the forward-note.
3. Re-read both edited docs end-to-end for internal consistency (no lingering
   "add by e-mail", no "magic-link" invite claim, no `target_email`).

**Verify:** `./scripts/check.sh` (runs the Prettier MD format check) · manual
re-read of the edited sections.

**Notes:**

- Verified with `pnpm exec prettier --check` on the two edited docs (the
  MD-format part of `check.sh`) — passes. Did not run the full gauntlet:
  the change is doc-only, so svelte-check / vitest / pgTAP / sqlfluff have
  no new input.
- Both rewritten RPC sketches now resolve against `public.profiles` and no
  longer touch `auth.users` for the username lookup, so I changed their
  `set search_path` from `public, auth` → `public` (`add_circle_by_username`
  and `send_invitation`). Task 1.1 should carry this forward — the shipped
  functions read `profiles.username` (mirroring `resolve_username` in
  `db/migrations/0020`), not `auth.users.email`.
- `add_circle_by_id` is unchanged: it takes a `uuid` and still checks
  `auth.users`, so it keeps `search_path = public, auth`. Only the comment
  reference to the sibling function was renamed.

### [ ] 0.2 Reconcile `docs/ui.md` and `docs/data-model.md`

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** The UI doc still documents "By email" fields and has no `@username`
visual role; the data-model doc's profiles-read note omits `username`. Both must
match the code 2005 ships.

**Prerequisites:** Task 0.1 (the same username-add vocabulary).

**Decisions:**

- **`docs/ui.md`:** the invite-picker and circle-screen sections gain the "By
  username" / "Add by username" field (dropping "By email"). Add a new
  **`.identity-handle`** role beside `.identity-name` (a person's `@handle`: muted
  token colour, caption-scale — not `.mono`, which is numerics-only), and list
  where `@username` renders: profile sheet (prominent), members, vote attribution,
  item attribution, invite-picker rows, circle rows.
- **`docs/data-model.md`:** the profiles-read note (`:728`) adds `username` to the
  columns other-user profile reads select. Leave the `send_invitation` /
  `add_circle_by_*` RPC-list wording to ride with the migration (Task 1.1/1.2).

**Files:**

- `docs/ui.md` (modify)
- `docs/data-model.md` (modify)

**Steps:**

1. Edit the `ui.md` invite-picker + circle-screen sections and add the
   `.identity-handle` role + render-location list.
2. Edit the `data-model.md` profiles-read note to include `username`.

**Verify:** `./scripts/check.sh` (Prettier MD format check) · manual re-read.

## Phase 1 — DB migration + pgTAP

### [ ] 1.1 Username-keyed `send_invitation`, truthful miss, and `target_email` retirement

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** Adding a person to a list must key on the public username, not e-mail
(parent R10), and — since the unregistered-e-mail path was inert — the
`invitations.target_email` column is removed so every invite resolves to a real
user or raises (parent R6).

**Prerequisites:** Phase 0 (docs reconciled). `profiles.username` + the
`lower(username)` unique index exist (2001, `db/migrations/0019`). The current
`send_invitation(p_list_id, p_email, p_user_id)` lives in
`db/migrations/0009_invitations.sql:91`.

**Decisions:**

- **DROP + CREATE.** Renaming `p_email`→`p_username` is impossible with
  `CREATE OR REPLACE`, so `DROP FUNCTION public.send_invitation(uuid, text, uuid);`
  then `CREATE FUNCTION public.send_invitation(p_list_id uuid, p_username text
  DEFAULT NULL, p_user_id uuid DEFAULT NULL) RETURNS uuid` (`SECURITY DEFINER`,
  `SET search_path = public`). Re-`REVOKE ALL FROM public` and `GRANT EXECUTE TO
  authenticated`.
- **Resolve inline:** `SELECT id INTO target FROM public.profiles WHERE
  lower(username) = lower(p_username)` when `p_user_id` is null; `p_user_id` still
  wins when both are given. On a resolve **miss**, `RAISE EXCEPTION 'no such user'`
  (SQLSTATE `P0001`) — the truthful, distinguishable error (parent R6; username
  existence is public).
- **Checks unchanged, wrappers collapse.** Keep the inviter-membership, self-invite
  (`'self-invite'`), existing-live-membership (`'already a member'`),
  existing-pending-invite short-circuit, block-check (`RETURN NULL`), and
  `invite_policy` check (`nobody`/`circle` → `RETURN NULL`) exactly as today. Since
  `target` is now never `NULL`, the `IF target IS NOT NULL` guards around steps
  4–7 are dropped. The insert writes `target_user_id` only (no `target_email`).
- **`invitations` schema:** `DROP INDEX IF EXISTS public.invitations_target_email_uniq;`
  drop the `CHECK (target_user_id IS NOT NULL OR target_email IS NOT NULL)`
  constraint; `ALTER TABLE public.invitations DROP COLUMN target_email;`
  `ALTER TABLE public.invitations ALTER COLUMN target_user_id SET NOT NULL;`.
  `accept_invitation` / `decline_invitation` need no change (they key on id + uid).
- `export_my_data()` already **excludes** `target_email` from its output, but its
  pgTAP (`db/tests/export_my_data.sql`) **seeds an email-keyed invite** to exercise
  that exclusion — so the test breaks on the drop and **must be edited** (it does
  not "stay green" untouched). The same is true of every fixture that inserts an
  email-keyed row or names the `target_email` column (see the fixture-cleanup step).

**Reference:** `db/tests/resolve_username.sql` for seeding usernames onto the
fixture rows; `docs/invites.md` (post-0.1) for the check sequence.

**Files:**

- `db/migrations/0022_add_by_username.sql` (create)
- `db/tests/invitations.sql` (modify)
- `db/tests/schema_shape.sql` (modify)
- `db/tests/export_my_data.sql` (modify — seeds an email-keyed invite; column drop + `NOT NULL`)
- `db/tests/invite_cascades.sql` (modify — seeds a `guest@test` email-keyed row)
- `db/tests/0012_invite_visibility.sql` (modify — inserts `(created_by, target_email)` rows)
- `db/tests/invitations_delete.sql` (modify — names `target_email` in its INSERT column list)

**Steps:**

1. RED — In `db/tests/invitations.sql`: seed usernames onto Alice/Bob/Carol in
   the setup (mirror `resolve_username.sql`). Rewrite the e-mail-keyed calls to
   `p_username` in the happy-path (B), already-member (G), block→NULL (I),
   policy-`nobody`→NULL (J), policy-`circle`-not-in→NULL (K), policy-`circle`-in
   →success (L), both-args-`p_user_id`-wins (N), and short-circuit (O) sections.
   Add a **truthful-miss** case: `send_invitation(list, p_username := 'ghost')`
   raises `P0001 'no such user'` (distinct from the `NULL` block/policy returns).
   **Delete** the e-mail-keyed cases: M (send unregistered), T (accept
   email-keyed), V4 (decline email-keyed). Also strip `target_email` from **every**
   `INSERT INTO public.invitations (…)` column list in this file (there are ~13,
   not only the lettered sections above — the column is going).
2. RED — Fix the cross-file fixtures that seed email-keyed invites so they compile
   after the drop + `target_user_id NOT NULL`: `db/tests/export_my_data.sql`
   (remove the `dave@test` email-keyed insert and rewrite the "target_email
   excluded" assertion into something still meaningful post-drop),
   `db/tests/invite_cascades.sql` (drop the `guest@test` email-keyed row and any
   assertion on it), `db/tests/0012_invite_visibility.sql` (rewrite the
   `(created_by, target_email)` inserts to user-keyed), and
   `db/tests/invitations_delete.sql` (drop `target_email` from its INSERT column
   lists).
3. RED — In `db/tests/schema_shape.sql`: assert `invitations.target_email` is
   **absent**, `invitations.target_user_id` is `NOT NULL`, and
   `invitations_target_email_uniq` is **absent**.
4. RED — `./scripts/test-db.sh` → red (functions/columns not yet changed).
5. GREEN — Create `db/migrations/0022_add_by_username.sql`: the DROP+CREATE of
   `send_invitation` and the `invitations` schema changes per Decisions.
6. GREEN — `./scripts/test-db.sh` → green (all fixtures above included).

**Verify:** `./scripts/test-db.sh`

### [ ] 1.2 `add_circle_by_username` replaces `add_circle_by_email`

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** The manual circle-add must key on username (parent R10), preserving the
mutual two-row outcome that is the whole point of the manual path (parent R4,
`docs/circles.md`).

**Prerequisites:** Task 1.1 (migration `0022` exists — append to it).
`add_circle_by_email(text)` lives in `db/migrations/0008_relationships.sql:119`;
`add_circle_by_id` (`:171`) is untouched.

**Decisions:**

- **DROP + CREATE:** `DROP FUNCTION public.add_circle_by_email(text);` then
  `CREATE FUNCTION public.add_circle_by_username(p_username text) RETURNS void`
  (`SECURITY DEFINER`, `SET search_path = public`). Re-`REVOKE ALL FROM public`
  and `GRANT EXECUTE TO authenticated`.
- **Body:** resolve `SELECT id INTO target FROM public.profiles WHERE
  lower(username) = lower(p_username)`; `RAISE 'no such user'` on miss (truthful —
  its predecessor raised too), `RAISE 'cannot add yourself'` when `target = me`;
  then the **mutual** block-permitting double upsert verbatim from
  `add_circle_by_email` (caller→target and target→caller, each
  `ON CONFLICT (user_id, other_user_id) DO UPDATE SET status = 'circle' WHERE
  public.relationships.status <> 'blocked'`).
- Update `db/tests/grants.sql`: rename **both** `add_circle_by_email` assertions
  — the authenticated-positive (`:209`) and the anon-negative (`:487`) — to
  `add_circle_by_username`. `send_invitation`'s grant assertions (`:232`, `:517`)
  need **no** change: only the parameter name changes, and `has_function_privilege`
  keys on the type signature `(uuid, text, uuid)`, which is unchanged.

**Reference:** `docs/circles.md` (post-0.1) — the username-add path and mutual
outcome; `db/migrations/0008_relationships.sql` for the upsert shape to copy.

**Files:**

- `db/migrations/0022_add_by_username.sql` (modify)
- `db/tests/relationships.sql` (modify)
- `db/tests/grants.sql` (modify)

**Steps:**

1. RED — In `db/tests/relationships.sql`: seed usernames onto the fixture rows.
   Rewrite the `add_circle_by_email` sections to `add_circle_by_username(<handle>)`:
   C (mutual — both rows created), D (block-skips-mutual), E (caller-has-target-
   blocked — own blocked row preserved), F (both-blocked no-op), and G (errors:
   G1 own username raises, G2 unregistered username raises). Leave the
   `add_circle_by_id` sections (H, I, J) unchanged.
2. RED — In `db/tests/grants.sql`: swap the function name.
3. RED — `./scripts/test-db.sh` → red.
4. GREEN — Append the `add_circle_by_username` DROP+CREATE to `0022`.
5. GREEN — `./scripts/test-db.sh` → green.

**Verify:** `./scripts/test-db.sh`

## Phase 2 — RPC client wrappers + username input fields

### [ ] 2.1 Invite wrapper + `InvitePickerSheet` username field

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** The invite picker must collect a username (not an e-mail) and surface the
three server outcomes distinctly (parent R6/R10): sent, couldn't send, no such
username.

**Prerequisites:** Task 1.1 (`send_invitation(p_username)` exists, returns uuid /
`NULL`, raises `P0001 'no such user'`). Current wrapper `sendInvitation` at
`web/src/lib/invite/state/invitations.svelte.ts:114`; picker e-mail section at
`web/src/lib/invite/components/InvitePickerSheet.svelte:192`.

**Decisions:**

- **Wrapper:** `sendInvitation(listId, { username })` posts `{p_list_id,
  p_username}`; keep the existing `{ userId }` overload (`{p_list_id, p_user_id}`)
  for tap-to-invite. Distinguish outcomes from the RPC result: a returned **uuid**
  → success ("Invite sent"); a **`null`** body → "Couldn't send invite"; an
  `ApiError` with `P0001` message `'no such user'` → "No such username". This
  replaces today's single hedged "If they have a Cairn account…" message. Keep the
  existing `'self-invite'` / `'already a member'` mappings.
- **Drop dead `target_email`:** it lives on the **sent** types, not the inbox —
  remove `targetEmail` from `SentEntry` (`:9`) and `RawSentRow` (`:27`), and the
  `targetEmail: r.target_email` line from the `loadSent` mapping (`:55`). Nothing
  consumes `SentEntry.targetEmail`, so the removal is inert; the column is gone.
- **Picker field (design `cairn-invite-screens.jsx:1087-1134`):** the bottom "By
  e-mail" `<section>` becomes "By username" — `Label` "By username", `TextInput`
  with `placeholder="@username"` and **without** `type=email` / `inputmode=email`
  / `autocomplete=email`, a `sendByUsername` submit handler, and the `data-test`
  ids renamed (`invite-picker-username-input` / `-send`). Update the header
  subtitle copy (`:111-117`) from "type an e-mail below" to "type a username
  below". Render the three outcomes via the existing `Snackbar` / inline message.
  Drop the stale anti-enumeration comment at `InvitePickerSheet.svelte:95-98` —
  it asserts the inviter must not learn whether an account exists, the exact
  stance R3 reverses.

**Reference:** `docs/invites.md` (post-0.1) for the outcome wording.

**Files:**

- `web/src/lib/invite/state/invitations.svelte.ts` (modify)
- `web/src/lib/invite/state/invitations.test.ts` (modify)
- `web/src/lib/invite/state/__mocks__/invitations.svelte.ts` (modify — the manual
  Vitest mock types `sendInvitation`'s target as `{ userId } | { email }`; reshape
  the `{ email }` arm to `{ username }` so `InvitePickerSheet.test.ts` type-checks)
- `web/src/lib/invite/components/InvitePickerSheet.svelte` (modify)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts` (modify)

**Steps:**

1. RED — Update `invitations.test.ts`: `sendInvitation({ username })` posts
   `{p_list_id, p_username}`; uuid → sent, `null` → couldn't, `P0001 'no such
   user'` → no-such-username; `{ userId }` overload still posts `p_user_id`;
   remove `target_email`/`targetEmail` from the inbox assertions (and the `:109`
   select string if it names it).
2. RED — Update `InvitePickerSheet.test.ts`: a username input submits via the
   wrapper; each of the three outcomes renders its message; assert the new
   `data-test` ids and no `type=email`.
3. RED — `cd web && pnpm test` → red.
4. GREEN — Implement the wrapper changes and the picker field per Decisions.
5. GREEN — `pnpm lint` · `pnpm check` · `pnpm test` → green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (in `web/`)

### [ ] 2.2 Circle wrapper + `CircleScreen` add-by-username field

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** The circle-management screen must add people by username (parent R10),
keeping its helpful inline errors.

**Prerequisites:** Task 1.2 (`add_circle_by_username(p_username)` exists). Current
wrapper `addCircleByEmail` at `web/src/lib/privacy/state/relationships.svelte.ts:55`;
add-card at `web/src/lib/privacy/components/CircleScreen.svelte:89`.

**Decisions:**

- **Wrapper:** rename `addCircleByEmail(email)` → `addCircleByUsername(username)`
  posting `{p_username}` to `/rpc/add_circle_by_username`; keep the
  `AddCircleResult = { ok } | { ok:false, reason: 'no-such-user'|'self'|'unknown' }`
  shape (map `P0001 'no such user'` → `'no-such-user'`, `'cannot add yourself'` →
  `'self'`).
- **Field (design `cairn-invite-screens.jsx:646-695`):** the dashed "Add by
  e-mail" card becomes "Add by username" — `Label` "Username", `TextInput`
  `placeholder="@username"` **without** the e-mail input attributes, `handleAdd`
  calling `addCircleByUsername`. Inline-error remap: `'no-such-user'` → "No such
  username", `'self'` → "That's your own username"; keep the generic snackbar for
  `'unknown'`. Update the helper sentence to read naturally for username. Rename
  the `data-test` ids (`circle-add-input` stays fine; keep `circle-add-btn` /
  `circle-add-error`).
- **Explainer copy.** `CircleExplainerSheet.svelte` (opened from `CircleScreen`,
  reachable via Settings → Privacy) has an explainer point titled "Adding by
  e-mail is two-way" whose body reads "If you add Bob's e-mail here…"
  (`CircleExplainerSheet.svelte:38-44`). Rewrite it to "Adding by username is
  two-way" / "If you add Bob's username here…" so it doesn't describe a field
  that no longer exists.
- Adding `username` to the circle **row** rendering is Task 3.4, not here.

**Files:**

- `web/src/lib/privacy/state/relationships.svelte.ts` (modify)
- `web/src/lib/privacy/state/relationships.test.ts` (modify)
- `web/src/lib/privacy/state/__mocks__/relationships.svelte.ts` (modify — the
  manual Vitest mock exports `addCircleByEmail`; rename it to
  `addCircleByUsername` in lockstep or `CircleScreen.test.ts`'s auto-mock import
  breaks at compile)
- `web/src/lib/privacy/components/CircleScreen.svelte` (modify)
- `web/src/lib/privacy/components/CircleScreen.test.ts` (modify)
- `web/src/lib/privacy/components/CircleExplainerSheet.svelte` (modify — copy;
  update its colocated test too if one exists)

**Steps:**

1. RED — Update `relationships.test.ts`: `addCircleByUsername('Bob')` posts
   `{p_username:'Bob'}`; error mapping preserved.
2. RED — Update `CircleScreen.test.ts`: the username field submits via
   `addCircleByUsername`; `'no-such-user'`/`'self'` inline messages render.
3. RED — `cd web && pnpm test` → red.
4. GREEN — Implement the wrapper rename and the field per Decisions.
5. GREEN — `pnpm lint` · `pnpm check` · `pnpm test` → green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (in `web/`)

## Phase 3 — `@username` rendering

### [ ] 3.1 `.identity-handle` CSS role + own `@username` in Settings

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** Every `@username` surface needs one shared visual treatment, and the user
needs to see their own handle (there is no self-profile screen — tapping your own
avatar bounces to Settings) so they can share it (parent R6; sub-plan R8).

**Prerequisites:** Phase 0.2 (the `.identity-handle` role is documented). Session
`AuthUser.username` is populated by 2003 (`web/src/lib/shared/state/session.svelte.ts:11`).

**Decisions:**

- **CSS role:** add `.identity-handle` in `web/src/lib/shared/styles/typography.css`,
  beside the existing `.identity-name` rule (`:104`). Muted colour via a token (the
  `--stone` / `--ink-soft` caption family), caption-scale, so the handle reads
  secondary to the display name. No hex — reference the token.
- **`NavRow` can't do this today.** The profile chip is a `NavRow`, whose only
  subtitle affordance is a `sub` **string** prop styled `.caption`
  (`NavRow.svelte:11,:32`) — not `.identity-handle`. Add an optional `handle?: string`
  prop to `NavRow` that renders `@{handle}` on `.identity-handle` beneath the title
  (reusable for any future chip). Do **not** overload `sub` for this.
- **Settings data source.** `username` is **not** in the `profile` store
  (`profile.svelte.ts` holds only uid/displayName/avatarVersion), so read it from
  `session.current.user.username` — which requires narrowing
  `session.current.status === 'signed-in'` first. Pass it as `handle` to the profile
  chip's `NavRow` (`SettingsScreen.svelte:46`).

**Reference:** `docs/ui.md` "Where CSS lives: layout local, visual global".

**Files:**

- `web/src/lib/shared/styles/typography.css` (modify — add `.identity-handle`)
- `web/src/lib/shared/components/NavRow.svelte` (modify — optional `handle` prop)
- `web/src/lib/shared/components/NavRow.test.ts` (modify — renders `@handle` when given)
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)

**Steps:**

1. RED — `SettingsScreen.test.ts`: the profile chip renders `@<username>` from a
   mocked session.
2. RED — `cd web && pnpm test` → red.
3. GREEN — Add the `.identity-handle` role; render the handle in Settings.
4. GREEN — `pnpm lint` · `pnpm check` · `pnpm test` → green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (in `web/`)

### [ ] 3.2 `@username` on the members screen and profile sheet

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** Two members with the same display name must be distinguishable, and the
profile sheet is the action hub where the handle should be **prominent** (parent
R6).

**Prerequisites:** Task 3.1 (`.identity-handle` exists). Members query +
`MemberRow` type at `web/src/lib/list/components/MembersScreen.svelte:14,45`;
`ProfileSheet` opened only from `MembersScreen.svelte:127`.

**Decisions:**

- **Members (design `cairn-screens.jsx:1945-1970`):** add `username` to the
  `profiles!user_id(...)` embed in the members `select=` (`:45`) and to the inline
  `MemberRow` `profiles` type (`:14-19`); render `@username` on `.identity-handle`
  as a line in the member row's text column.
- **Profile sheet (design `cairn-invite-screens.jsx:875-918`):** add a `username`
  prop to `ProfileSheet.svelte`; render `@username` **prominently** on its own
  line directly under the `identity-name` `<h2>` (`:62`) and above the state chip.
  `MembersScreen` passes `username={m.profiles.username}` (`:129`).
- Suppress the handle line for the tombstone user (it renders "Deleted user").
- **The design canvas shows no `@username`** (the feature postdates it); the cited
  JSX ranges are for surrounding layout only — placement follows parent R6.

**Files:**

- `web/src/lib/list/components/MembersScreen.svelte` (modify)
- `web/src/lib/list/components/MembersScreen.test.ts` (modify)
- `web/src/lib/profile/components/ProfileSheet.svelte` (modify)
- `web/src/lib/profile/components/ProfileSheet.test.ts` (modify)

**Steps:**

1. RED — `MembersScreen.test.ts`: a member row renders `@username`; the members
   `select=` includes `username` (update the query assertion if present).
2. RED — `ProfileSheet.test.ts`: `@username` renders under the display name; not
   rendered for the tombstone uid.
3. RED — `cd web && pnpm test` → red.
4. GREEN — Add `username` to the query/type, render on both surfaces, thread the
   prop.
5. GREEN — `pnpm lint` · `pnpm check` · `pnpm test` → green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (in `web/`)

### [ ] 3.3 `@username` in vote attribution and item created/modified attribution

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** Vote chips and the "Added by … / Last edited by …" line show bare display
names; identical names must be disambiguated by handle (parent R6).

**Prerequisites:** Task 3.1. The item model builds these in
`web/src/lib/item/model/item.ts` (embeds `:51`/`:58`/`:101`; `ItemRanked`
`:31-32`, `MemberVote` `:35-40`; mapping `:83-84`/`:89-94`/`:112`); rendered in
`web/src/lib/item/components/ItemsScreen.svelte` (votes `:194-212`, attribution
`:224-239`).

**Decisions:**

- **Model:** add `username` to the three profile embeds (`created_by_profile`,
  `modified_by_profile`, voter `profile`) and to the `ItemRanked`/`MemberVote`
  types; carry `created_by_username`, `modified_by_username`, and
  `member_votes[].username` through the mapping (and the `addItem` representation
  at `:101`/`:112`).
- **Render (design `cairn-screens.jsx:1047-1105`):** `@username` on
  `.identity-handle` beside each voter in the vote chips, and after the bolded
  name in the "Added by … / Last edited by …" line. Suppress for the tombstone
  uid (`TOMBSTONE_UID`, already referenced in `ItemsScreen`).
- **The design canvas shows no `@username`** (the feature postdates it); the cited
  JSX range is for surrounding layout only — placement follows parent R6.

**Files:**

- `web/src/lib/item/model/item.ts` (modify)
- `web/src/lib/item/model/item.test.ts` (modify)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**

1. RED — `item.test.ts`: the mapper carries `created_by_username` /
   `modified_by_username` / `member_votes[].username` from the embeds; the
   `select=` strings include `username`.
2. RED — `ItemsScreen.test.ts`: a voter chip and the attribution line render
   `@username`; suppressed for the tombstone.
3. RED — `cd web && pnpm test` → red.
4. GREEN — Add `username` to embeds/types/mapping and render in `ItemsScreen`.
5. GREEN — `pnpm lint` · `pnpm check` · `pnpm test` → green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (in `web/`)

### [ ] 3.4 `@username` on circle rows and invite-picker rows

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** The circle-management rows and the invite picker's tappable circle /
co-member rows show display names that must be disambiguated (parent R6).

**Prerequisites:** Task 3.1. Circle/blocked select at
`web/src/lib/privacy/state/relationships.svelte.ts:45`; the picker's tappable
rows in `web/src/lib/invite/components/InvitePickerSheet.svelte` and their data
sources (the circle list from `relationships`, and the co-member list the picker
loads).

**Decisions:**

- Add `username` to the `profiles!other_user_id(...)` embed in the relationships
  `select=` (`:45`) and to the mapped row objects (`:12`, `:21`); render
  `@username` on `.identity-handle` on each `CircleScreen` circle row (design
  `cairn-invite-screens.jsx:598-642`).
- **Types must carry `username` too** (in `web/src/lib/privacy/model/relationship.ts`):
  add it to `RelationshipRow.profiles` (`:5-8`), `CircleEntry` (`:11-16`), and
  `BlockedEntry` (`:18-23`) — otherwise `row.profiles.username` and the mapped
  objects won't type-check.
- **The design canvas shows no `@username`** anywhere (the feature postdates it);
  the cited JSX ranges are for surrounding layout only — placement follows parent R6.
- Add `username` to the picker's circle **and** co-member row data sources and
  render `@username` on each tappable row (design `cairn-invite-screens.jsx:1143-1180`).
- Update the string-equality `select=` assertions in `relationships.test.ts` in
  lockstep.

**Files:**

- `web/src/lib/privacy/model/relationship.ts` (modify — `username` on `RelationshipRow.profiles`, `CircleEntry`, `BlockedEntry`)
- `web/src/lib/privacy/state/relationships.svelte.ts` (modify)
- `web/src/lib/privacy/state/relationships.test.ts` (modify)
- `web/src/lib/privacy/components/CircleScreen.svelte` (modify)
- `web/src/lib/privacy/components/CircleScreen.test.ts` (modify)
- `web/src/lib/invite/components/InvitePickerSheet.svelte` (modify)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts` (modify)

**Steps:**

1. RED — `relationships.test.ts`: the select includes `username`; mapped rows
   carry it. `CircleScreen.test.ts`: a circle row renders `@username`.
   `InvitePickerSheet.test.ts`: a tappable circle/co-member row renders `@username`.
2. RED — `cd web && pnpm test` → red.
3. GREEN — Add `username` to the selects/sources and render on all three row
   types.
4. GREEN — `pnpm lint` · `pnpm check` · `pnpm test` → green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (in `web/`)

## Phase 4 — Playwright

### [ ] 4.1 Add-by-username happy path + truthful miss (e2e)

**Created:** 2026-07-09T09:46:23Z
**Completed:**

**Why:** The user-visible add-by-username flow crosses the DB, BFF/PostgREST, and
UI layers; a Playwright touch proves it end-to-end against the real stack (parent
R6/R10; `docs/testing.md`, `CLAUDE.md` "new user-visible flows get a Playwright
touch").

**Prerequisites:** Phases 1–3 merged locally. Seed users (alice/bob/carol) have
known usernames from 2003's `scripts/seed.sh` / `DevShortcuts`.

**Decisions:**

- Sign in as a seeded user via the dev shortcut; open a list's members → invite
  picker; add another seeded user **by username**; assert the success message and
  that the target appears (or the invite lands) and that `@username` shows on the
  members screen / profile sheet.
- Assert the **truthful miss**: typing a nonexistent handle shows "No such
  username" (not the generic couldn't-send).
- No Mailpit — this flow sends no e-mail.

**Files:**

- `web/e2e/invites.spec.ts` (modify — extend the existing invite e2e; note the
  plural filename, so this appends rather than creating a duplicate)
- `web/e2e/privacy.spec.ts` (optional — if the circle add-by-username path is
  exercised e2e, it belongs here alongside the existing circle/block specs)

**Steps:**

1. RED — Write the spec: add-by-username success + `@username` visible + the
   nonexistent-handle "No such username" assertion.
2. RED — `cd web && pnpm test:e2e` → red (or run against the failing pre-impl
   state if authored before the UI lands).
3. GREEN — With Phases 1–3 in place, `pnpm test:e2e` → green on chromium +
   firefox. **WebKit is not run on this box** (missing system libs — standing
   machine-conditional rule, `docs/testing.md`); note this in the task's Notes.

**Verify:** `cd web && pnpm test:e2e` (chromium + firefox) · `./scripts/check.sh`

## Merge (orchestration task 5.1)

After all tasks are `[x]` and `./scripts/check.sh --e2e` is green on this branch:
`git checkout 2000_username_identity && git merge --no-ff 2005_add_by_username`,
then confirm `./scripts/check.sh --e2e` green on the parent.
