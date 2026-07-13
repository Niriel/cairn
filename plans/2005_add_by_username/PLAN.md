# Plan: add-by-username + `@username` disambiguation (2005)

Sub-step 2005 of step 20 (`2000_username_identity`). It swaps the invite/circle
**add-key** from e-mail to the public username, and makes `@username` visible
wherever a person is shown so non-unique display names are always resolvable.
This is the last place e-mail acted as a public add-key, and the "add by e-mail
is confusing" surface the whole step set out to remove. Refines parent **R6**
(disambiguation) and **R10** (add-by-username).

## Context

Step 20 moves Cairn's identity from e-mail to a public `username`. The
foundation is already on `2000_username_identity`:

- **2001** added `profiles.username` (`NOT NULL`, `^[A-Za-z0-9]{3,30}$`, unique on
  `lower(username)`; `db/migrations/0019`), `set_username`, and the
  recovery-e-mail home.
- **2003** made username the credential (register/sign-in via the BFF), added
  `public.resolve_username(p_username)` (`db/migrations/0020:142`; `SECURITY
  DEFINER`, granted `anon`+`authenticated`, returns `(id, username)`), made
  **registration open** (no invite gate), and put `username` on the session
  `AuthUser`.

Two things are still e-mail-shaped. First, **adding people is keyed by e-mail**:
`send_invitation`'s e-mail branch and `add_circle_by_email`
(`db/migrations/0008`, `0009`) look a target up in `auth.users` by address. The
e-mail here was only ever an *identifier* — the one way to name someone not
already surfaced via your circle or co-members. It never sent mail: there is no
magic-link/SMTP call on the invite path, and nothing converts a stored
`target_email` row into a real invite at signup (`tg_profile_on_signup` doesn't
touch `invitations`). So `docs/invites.md:155-159`'s "triggers a magic-link
email … converted at sign-up" was aspirational and never built; an unmatched
address just produced an inert `target_email` row (never mailed, never
converted, never shown — the inbox filters on `target_user_id`). Second,
**`@username` is shown nowhere in the live app** (the only render is in the
data-export HTML), so two "Alex"es are indistinguishable on the members screen,
in vote attribution, etc.

Both docs carry a 2001 forward-note deferring these mechanics to "step 20"
(`docs/invites.md:66`, `docs/circles.md:49`) — **2005 is where they are
resolved**. This sub-step is independent of the session work (2002–2004); it
builds only on 2001's column and 2003's resolver. The data model is favourable:
identity, attribution, membership, circles, and invitations all hang off the
immutable `auth.users.id`, so only the *input resolution* (e-mail → username) and
the *rendered handle* change; the `relationships` table is already uuid-keyed
with no e-mail column.

## Decisions

**Resolve inline in the RPC, don't add a client round-trip (R1).** Parent R10
mandates the RPCs *accept a username and resolve it*. The invite/circle RPCs are
already `SECURITY DEFINER`, so they resolve inline —
`SELECT id INTO target FROM public.profiles WHERE lower(username) = lower(p_username)`
— mirroring how they inline the `auth.users` e-mail lookup today, and matching
the precedent `request_password_reset` set in `db/migrations/0021`.
`resolve_username` stays the BFF's sign-in helper; the RPCs don't call it (a
`SECURITY DEFINER` function calling another adds nothing over the inline `SELECT`
and would obscure the block/policy logic that follows).

**DROP + CREATE, not CREATE OR REPLACE (R1).** Renaming an input parameter
(`p_email`→`p_username`) or a function (`add_circle_by_email`→`add_circle_by_username`)
is not possible with `CREATE OR REPLACE` — Postgres rejects "cannot change name
of input parameter". The migration `DROP`s the old functions and `CREATE`s the
new ones, re-establishing `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated`.
Nothing else depends on these functions (the block-auto-decline trigger is on
`relationships` and doesn't call them; accept/decline don't call send).

**Truthful miss, generic private-setting failures (R3).** Username existence is
already public — the register screen reveals taken handles, and
`resolve_username` is `anon`-callable — so a nonexistent handle can be answered
truthfully with no new leak, which is better UX (a typo gets a signal) and is
what parent R10 permits. `send_invitation` raises `'no such user'` (P0001) on a
miss (distinct from the `NULL` it returns for block/policy). Block and the two
excluding `invite_policy` outcomes still return `NULL` and merge into the single
"Couldn't send invite", because *those* leak the target's private settings — the
merge `docs/invites.md` already requires. This splits today's generic bucket:
"doesn't exist" moves out (truthful), block/policy stay in. Confirmed with the
user.

**Retire the e-mail identifier and drop `target_email` now (R6).** Since the
unregistered path was inert, retiring it removes a dead-end, not a feature.
`send_invitation` loses its `target IS NULL` branch entirely (so the
`IF target IS NOT NULL` wrappers around the checks collapse), and the migration
drops `invitations.target_email`, its partial unique index, and the "at least one
key" CHECK, then sets `target_user_id NOT NULL`. Confirmed with the user
(preferred dropping the column in 2005 over deferring it to 2006). The
destructive column drop is flagged prod-facing below.

**`add_circle_by_username` stays mutual (R4).** The manual circle-add's reason to
exist is the symmetric two-row outcome (`docs/circles.md`); the new function
reproduces the double block-permitting upsert verbatim. Only the one-sided
tap-add (`add_circle_by_id`) writes a single row, and it is untouched (R5).

**`@username` needs a global visual role (R7).** There is no `.identity-username`
treatment today and `.mono` is numerics-only (`docs/ui.md:453`), so `@username`
can't reuse it. Define a global `.identity-handle` role (muted stone/ink-soft,
caption-scale) per ui.md's "layout local, visual global"; components render
`@{username}` and reference a token, never a hex. The tombstone user's handle
line is suppressed (it renders "Deleted user").

## Architecture

DB work ships pgTAP in `db/tests/`; web work ships Vitest
(`web/src/**/*.test.ts`) and a Playwright touch (`web/e2e/`). Three layers, per
`docs/testing.md`. `profiles_select` is world-readable to any signed-in caller
and there is **no column grant on `profiles`**, so `username` is already readable
via PostgREST — the frontend only needs it added to `select=` lists and types; no
DB/RLS change for reads.

### New files

- **`db/migrations/0022_add_by_username.sql`** — DROP+CREATE the username-keyed
  `send_invitation` and `add_circle_by_username`; drop `invitations.target_email`
  (+ its index + CHECK); `target_user_id NOT NULL`; grants.

### Modified files (DB + tests)

- **`db/tests/invitations.sql`** — rewrite the e-mail cases to username; prove the
  truthful miss; delete the e-mail-keyed cases (M send-unregistered, T
  accept-email-keyed, V4 decline-email-keyed).
- **`db/tests/relationships.sql`** — rewrite `add_circle_by_email` cases to
  `add_circle_by_username` (mutual, block-skips-mutual, caller-blocked, own-
  username raises, unregistered-username raises).
- **`db/tests/grants.sql`**, **`db/tests/schema_shape.sql`** — swap function
  names, drop `target_email`, assert `target_user_id NOT NULL`.

### Modified files (web)

- **`web/src/lib/invite/state/invitations.svelte.ts`** — `sendInvitation(listId,
  { username })` posting `{p_list_id, p_username}` (keep the `{ userId }`
  overload); inspect the return so uuid → "Invite sent", `null` → "Couldn't send
  invite", P0001 `'no such user'` → "No one on Cairn has that username"; drop the now-dead
  `target_email`/`targetEmail` field + mapping (`:27`, `:55`).
- **`web/src/lib/privacy/state/relationships.svelte.ts`** — rename
  `addCircleByEmail`→`addCircleByUsername(username)` posting `{p_username}` (keep
  the `{ ok, reason }` result shape); add `username` to the circle/blocked select.
- **`web/src/lib/item/model/item.ts`** — add `username` to the three profile
  embeds (`:51`, `:58`, `:101`) and the `ItemRanked`/`MemberVote` types; carry
  `created_by_username` / `modified_by_username` / `member_votes[].username`.
- **`web/src/lib/invite/components/InvitePickerSheet.svelte`** — "By e-mail"
  section → "By username" field; `@username` on the tappable rows.
- **`web/src/lib/privacy/components/CircleScreen.svelte`** — "Add by e-mail" card
  → "Add by username"; `@username` on circle rows; inline-error remap.
- **`web/src/lib/profile/components/ProfileSheet.svelte`** — `username` prop;
  render `@username` prominently under the name.
- **`web/src/lib/list/components/MembersScreen.svelte`** — `username` in the
  members select + `MemberRow` type; render `@username`; pass to `ProfileSheet`
  (its only opener, `:127`).
- **`web/src/lib/item/components/ItemsScreen.svelte`** — `@username` in vote chips
  and the attribution line.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — own `@username`
  under the profile chip (from `session.current.user.username`).
- **global CSS** — the `.identity-handle` role.
- Colocated `*.test.ts` for each component/model; the string-equality `select=`
  assertions in `relationships.test.ts` and `invitations.test.ts:109` update in
  lockstep with the query changes.

### Docs (Phase 0 + migration-riding)

`docs/invites.md`, `docs/circles.md`, `docs/ui.md`, `docs/data-model.md` — see
Phase 0 and R10.

### Invite outcome flow (`send_invitation`)

```
client → /rpc/send_invitation {p_list_id, p_username}
  inviter not a live member          → RAISE 'not a list member'  (checked first)
  resolve p_username → target      [lower(username) index on profiles]
    miss             → RAISE 'no such user' (P0001)   → UI "No one on Cairn has that username"
    self             → RAISE 'self-invite'            → UI clear error
    already member   → RAISE 'already a member'        → UI message
    existing pending → RETURN existing uuid (idempotent) → UI "Invite sent"
    block / policy   → RETURN NULL                     → UI "Couldn't send invite"
    ok               → RETURN new invitation uuid      → UI "Invite sent"
```

## Phase structure

TDD throughout — each task writes its pgTAP / Vitest / Playwright RED before the
GREEN that satisfies it. Phase 0 (docs) lands first so code references corrected
specs (parent R12/R19 pattern).

0. **Phase 0 — reconcile docs.** Rewrite `docs/invites.md` + `docs/circles.md`
   from e-mail-add to username-add (mutual outcome, check sequence, the truthful-
   miss split, and correcting the never-built magic-link prose to reality);
   resolve both forward-notes; update the pending-cap carve-out. Update
   `docs/ui.md` (By-username fields, the `.identity-handle` role, `@username`
   render locations) and `docs/data-model.md` (profiles-read note gains
   `username`). The DDL-level RPC-list wording rides with Phase 1's migration.
1. **Phase 1 — DB migration + pgTAP.** `0022_add_by_username.sql`: username-keyed
   `send_invitation` with the truthful miss and `target_email` retirement
   (Task 1.1), then `add_circle_by_username` (Task 1.2). Positive **and** negative
   pgTAP for each, preserving the block/policy/self checks; grants + schema-shape
   tests updated.
2. **Phase 2 — RPC client wrappers + username input fields.** The invite wrapper
   + `InvitePickerSheet`'s username field with the three outcomes (Task 2.1); the
   circle wrapper + `CircleScreen`'s add-by-username field (Task 2.2). Vitest for
   both.
3. **Phase 3 — `@username` rendering.** The `.identity-handle` CSS role + own
   handle in Settings (Task 3.1); members + profile sheet (Task 3.2); votes + item
   attribution (Task 3.3); circle rows + invite-picker rows (Task 3.4). Each adds
   `username` to that surface's query/type and renders it. Vitest per surface.
4. **Phase 4 — Playwright.** Add-by-username happy path + the truthful miss +
   `@username` visible, against the real stack (seeded usernames; no Mailpit).

## Reference docs and skills

- **`plans/2000_username_identity/REQUIREMENTS.md`** (R6, R10, and the privacy
  contract) and **`PLAN.md`** — the parent contract this sub-step refines.
- **`docs/invites.md`** — the send-invitation check sequence and the "What
  blocked invites look like" anti-enumeration list that R3 refines; the RPC
  sketches Phase 0 rewrites.
- **`docs/circles.md`** — the one-directional, invisible circle model and the
  mutual add-by-e-mail→username path (R4).
- **`docs/data-model.md`** — `profiles.username`, `resolve_username`, the
  `invitations` schema; the profiles-read note updated in Phase 0.
- **`docs/ui.md`** — TopBar / button-pair / form-primitive conventions, and the
  `.identity-name` role the new `.identity-handle` sits beside.
- **`docs/frontend-layout.md`** — lib tier split, filename rules, mock placement.
- **`docs/testing.md`** — the three test layers; pgTAP positive + negative.
- **`design/cairn-invite-screens.jsx`** (invite picker, circle screen, profile
  sheet) and **`design/cairn-screens.jsx`** (members, item panel) — layout specs
  recorded in the UI tasks.

## Open questions

- **`.identity-handle` colour token.** Default: the muted `--stone` / `--ink-soft`
  family already used for caption/sub text, so the handle reads as secondary to
  the display name. Settled against `tokens.css` in Phase 3.1; not a blocker.
- **Existing prod `target_email` rows.** _Resolved (user, 2026-07-09):_ the live
  alpha is two accounts; there is **no invite-row migration**. The column and any
  rows in it are simply dropped, and users re-invite by hand. No data-preservation
  work of any kind.

## Prod-facing note (CLAUDE.md "We are going live")

`DROP COLUMN target_email` is a **destructive schema change** that runs against
prod when `2000_username_identity` merges to `main` and deploys. No invite-row
migration is done: the column and any rows in it are dropped, and users re-invite
by hand (the live alpha is two accounts; the rows were always inert anyway — no
mail sent, none convertible, none ever shown). Confirmed with the user
(2026-07-09). 2005 itself does not deploy.
