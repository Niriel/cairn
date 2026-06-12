# Requirements: Data export (GDPR portability)

Cairn must let any signed-in user download a complete, Cairn-independent
copy of their own data — a personal archive, not a database backup (see
`docs/data-export.md`). This exists to satisfy the GDPR data-portability
right and to give users a tangible "yours forever" artefact they can open
without Cairn. The data layer is a single `security definer` RPC; the web
layer renders that JSON into a ZIP assembled in the browser tab, with no
server-side staging.

## R1. `public.export_my_data()` returns the caller's per-user document

A `security definer` PL/pgSQL function `public.export_my_data()` returns
`jsonb`, runs with `SET search_path = public, auth`, is `REVOKE`d from
`public` and `GRANT EXECUTE`d to `authenticated`. It is the only
sanctioned export path (PostgREST exposes it as `POST /rpc/export_my_data`).

It guards before reading, mirroring `public.delete_account()` (0014):

- `uid IS NULL` → `RAISE EXCEPTION 'not authenticated' USING errcode = '28000'`.
- `uid = '00000000-0000-0000-0000-000000000000'` (tombstone) →
  `RAISE EXCEPTION 'cannot export the tombstone user' USING errcode = '28000'`.

On success it returns the document described in `docs/data-export.md`
§ "`data.json` shape", with top-level keys `exported_at` (`now()`),
`schema_version` (integer `1`), `user`, `lists`, `circle`, `blocked`,
`invitations_sent`, `invitations_received`.

## R2. The document is scoped to the caller, in every branch

`uid := public.uid()` bounds every branch — the function reads across
tables the caller's RLS would otherwise narrow, and the `where … = uid`
predicates are the entire access control:

- **`lists`** — every list the caller has a `list_members` row for
  (a live membership), **live and trashed lists alike**
  (`lists.deleted_at` carried through, not filtered). Each list carries
  `id, name, description, created_at, deleted_at`, a `members` array, and
  an `items` array.
- **`members`** — for each list, one entry per live `list_members` row as
  `{ id, display_name }` (display name from `profiles`; **no email**).
- **`items`** — every item on those lists, **live and soft-deleted**
  (`items.deleted_at` carried through). Each item carries
  `id, name, notes, created_by` (`{ id, display_name }`), `created_at`,
  `deleted_at`, `your_vote` (the caller's vote value on that item, or
  `null`), and `all_votes` (see R3).
- **`circle`** / **`blocked`** — the caller's own `relationships` rows
  with `status = 'circle'` / `'blocked'`, each as `{ display_name }` of
  the other user. The reverse direction (whether the other user has the
  caller) is never read — it is the other user's private setting.
- **`invitations_sent`** / **`invitations_received`** — rows where the
  caller is `created_by` / `target_user_id` respectively, reflecting
  pending state at export time. Each row is an **explicit allowlist**
  (never `to_jsonb(i)` / `jsonb_agg(i)`): the list it targets (by name,
  and `list_id` for reference), `created_at`, and the *other*
  party rendered as a **display name** where one exists. There is **no
  `status` field** — the `invitations` table holds only outstanding
  invites (accept/decline *delete* the row; see `0011_invitations_delete.sql`),
  so every entry is pending by construction and the section's meaning
  ("pending at export time") makes a per-row status redundant. The
  `invitations.target_email` column (`0009_invitations.sql:24`) is
  **deliberately excluded** — on an email-keyed invite the caller *sent*,
  `target_email` is the invitee's e-mail, not the caller's own, so
  emitting it would violate R4 and the `docs/invites.md` email-privacy
  contract. An email-keyed sent invite that has no claiming user yet
  carries no display name and no e-mail; render it by list name only.

A user who is not a member of a list sees nothing of that list; a second
user's votes on items the caller did not add never appear (except via
R3's `all_votes` on items the caller *did* add).

## R3. Vote scope is Option B — all votes on items the caller added

For each item the caller `created_by`, `all_votes` is an array of every
vote cast on that item by anyone, rendered as
`{ user_display_name, value }` — **display name only, never a UUID or
email**. For items the caller did not add, the `all_votes` key is **omitted**
(absent, not an empty array) — the RPC, the `ExportItem` type, and the
HTML renderer all treat "absent" as the canonical "no co-author votes"
form; the caller's own participation there is captured by `your_vote`.

This freezes the `docs/data-export.md` § "Open question — vote scope" to
**Option B** (the user's own votes plus all votes on items they added),
on the rationale that the live UI already shows those values to the item
author, so hiding them in the archive is paternalistic without privacy
gain. The decision must also be reflected in the doc (see PLAN Phase 0).

## R4. The `user` sub-document is an allowlist; no secret can leak

The `user` block names columns explicitly — `id`, `email` (the caller's
own), `display_name`, `signed_up_at` (from `auth.users.created_at`),
`invite_policy` (from `user_settings`), and `has_avatar`
(`profiles.avatar_version > 0`). It is built as an allowlist
`jsonb_build_object`, never `to_jsonb(u)` minus named secrets, so a
future GoTrue column (credential, recovery token, …) can never silently
appear. No branch of the entire document exposes any email but the
caller's own — co-member and `all_votes` rows carry display names only
(the privacy contract of `docs/invites.md`).

## R5. pgTAP proves scoping, the allowlist, Option B, the guards, and grants

`db/tests/export_my_data.sql` covers, with positive and negative cases:

- Per-user scoping: the caller's lists/items/votes/relationships/
  invitations appear; a non-member's list and a third party's votes on
  items the caller did not add do not.
- Option B: `all_votes` on an item the caller added includes a
  co-member's vote value by display name.
- Allowlist secret-stripping: seed sentinel values into every
  credential/recovery-token column on the caller (as `admin_inspect.sql`
  does) and assert each is **absent** from `user`, while `email` is
  present and correct.
- No co-member email anywhere in the document.
- Guards: tombstone caller and unauthenticated caller (no `sub` claim)
  both raise.
- Grant matrix: `authenticated` HAS EXECUTE; `anon` and `public` do NOT.

## R6. Settings exposes a "Privacy & data → Download my data" row

The Settings screen gains a new "Privacy & data" section, positioned
immediately **before** "Recovery" per the design artboard
(`design/cairn-export-screens.jsx` § 1) — the artboard and `docs/ui.md`
§ Settings show it adjacent to Recovery; the live screen's "Appearance"
and "Text size" sections fall above it. It holds one `NavRow`:
"Download my data", `download` icon, sub "A copy of everything Cairn
stores", navigating to `/settings/data-export`. Settings location
reflects that export is a privacy feature, not a marketed one
(`docs/data-export.md` § "What the user sees").

## R7. The export hub is one route with three states

`/settings/data-export` renders a single screen
(`ExportHubScreen.svelte`) whose body is driven by a client-side state
machine, not separate routes:

- **idle** — explanation of what's inside / two formats, and a
  "Prepare my download" button (`docs/data-export.md` § hub; artboard 2).
- **packaging** — a brief progress state with the blinking `feather`
  glyph (artboard 3 animates the feather icon, not a spinner) while the
  RPC runs, avatars fetch, and the archive assembles.
- **ready** — "Ready", a filename chip, and a "Download" button that
  triggers the browser save; copy notes the archive is valid until the
  page is closed (artboard 4).
- **error** — a recoverable failure message with a retry affordance.

There is no server-side staging: the archive lives in the tab's memory;
a refresh discards it and the user re-prepares (`docs/data-export.md`
§ "What we don't do").

## R8. The archive is a correctly-named ZIP with JSON + HTML, no JS inside

"Prepare my download" produces a ZIP named
`cairn-export-{yyyymmdd}-{shortid}.zip` (date of export, short random
id) containing, per `docs/data-export.md` § "Format":

- `data.json` — the canonical RPC document.
- `data.html` — a human-readable rendering of the same data, linking
  rows back to JSON paths. **Contains no JavaScript** — opens in any
  browser offline.
- `README.html` and `README.md` — explain what each file is.
- `avatar.webp` — present only if the caller has an avatar.
- `avatars/{uid}.webp` — co-members' avatars at export time, best-effort.

The HTML and READMEs are generated client-side from the same JSON; if
JSON and HTML ever disagree, JSON is canonical. The ZIP is assembled in
the browser with `jszip`.

## R9. Avatar embeds are best-effort and leak nothing on failure

The client fetches `/avatars/{uid}.webp` for the caller (→ `avatar.webp`)
and for each distinct co-member `id` in the document (→
`avatars/{uid}.webp`). Any non-200 response (404 for "no picture",
network error) is silently omitted — a missing avatar never aborts the
export and never surfaces an error. No `avatar_version` plumbing is
required: the cache-buster is irrelevant to a one-shot fetch, and a user
with no picture simply 404s.

## R10. The Delete-account screen links to the export hub

The Delete-account screen's existing "Want a copy of your data first?"
panel — currently a disabled `delete-account-export-download` button with
a `TODO(step-12)` (`DeleteAccountScreen.svelte:73-89`) — is enabled and
navigates to `/settings/data-export`. The two flows are independent:
back returns to the Delete-account screen, and neither blocks the other
(`docs/data-export.md` § "Delete-account variant").

## Non-requirements (explicitly excluded)

- **Schema / FK migration** — every table the export reads
  (`profiles`, `user_settings`, `lists`, `list_members`, `items`,
  `votes`, `relationships`, `invitations`, `auth.users`) already exists
  from migrations 0004–0017; the export is read-only and adds no column.
- **Delete-on-completion** — export and account deletion are independent;
  the only integration is the link in R10 (`docs/data-export.md`).
- **Server-side staging or a retention window** — the archive lives only
  in tab memory; nothing is written server-side.
- **Periodic / scheduled exports** — a user who wants a monthly copy runs
  the flow monthly; Cairn does no background work on user data.
- **Partial export** — the export is everything-at-once; no per-list or
  per-field selection.
- **RPC pagination** — v1 accounts are small (well under a megabyte); the
  documented paginated-walk variant is a future concern, not built here.
