# Tasks

## Reference skills and docs

- **`docs/data-export.md`** — the spec: included/excluded data, the
  `data.json` shape, the ZIP format, the screen flow, the build order.
- **`docs/ui.md`** — Settings section/`NavRow` layout, TopBar, progress
  states, and the "layout local, visual global" CSS rule.
- **`docs/frontend-layout.md`** — the `export/` domain split
  (`model/`/`state/`/`components/`); route-test filenames drop the `+`.
- **`docs/avatars.md`** — the `/avatars/{uid}.webp` URL and why R9 needs
  no `avatar_version` plumbing.
- **`docs/invites.md`** — email-is-private; no co-member email may leak.
- **`db/migrations/0017_admin.sql` (`admin.inspect_user`, line 185)** —
  the allowlist `jsonb_build_object` RPC template to copy.
- **`db/tests/admin_inspect.sql`** — the allowlist secret-stripping pgTAP
  template (sentinel-seed + `jsonb_exists` absence checks).
- **`db/migrations/0014_delete_account.sql`** — the guard pattern
  (NULL uid → 28000; tombstone → reject).
- **`db/tests/rpc_delete_account.sql`** — pgTAP harness conventions:
  `plan(N)`, fixtures, `set_config('request.jwt.claims', …, TRUE)`,
  `SET LOCAL ROLE`, `throws_ok`, `has_function_privilege`.

## Phase 0 — reconcile docs

### [x] 0.1 Freeze the vote-scope open question to Option B

**Created:** 2026-06-12T09:57:41Z
**Completed:** 2026-06-12T10:28:04Z

**Why:** `docs/data-export.md` flags vote scope as an open question
(indexed in `docs/open-questions.md`). The user chose **Option B** (the
caller's own votes plus all votes on items they added). The RPC body in
Phase 1 and its pgTAP both assume B, so the canonical spec must record
the decision first — otherwise downstream steps reference a stale,
undecided doc.

**Prerequisites:** None.

**Decisions:**
- Option B: items the caller added carry an `all_votes` array of every
  vote, rendered `{ user_display_name, value }` (display name only).
- Rationale to record: the live UI already shows the item author these
  values, so hiding them in the export is paternalistic without privacy
  gain.
- The doc's `data.json` shape left `invitations_sent` / `received` as
  bare `[...]`; the export defines a concrete entry shape (`list_name`,
  `list_id`, `created_at`, the other party's display name; **no
  `status`** — invites are pending-only). The doc must spell this out so
  Task 1.1's pgTAP is written against a documented shape.

**Files:**
- `docs/data-export.md` (modify)
- `docs/open-questions.md` (modify)

**Steps:**
1. In `docs/data-export.md` § "Open question — vote scope", rewrite the
   section to state that Option B is **decided** (date 2026-06-12), keep
   the one-paragraph rationale, and drop the "Flag for a deliberate call"
   framing. The `data.json` shape section already shows `all_votes`, so
   no shape edit is needed for votes.
2. In `docs/data-export.md` § "`data.json` shape", replace the bare
   `"invitations_sent": [...]` / `"invitations_received": [...]` with a
   concrete invitation entry (`list_id`, `list_name`, `created_at`, and
   `invitee_display_name` / `inviter_display_name`) plus a note that there
   is no `status` field and that `target_email` is excluded. (Already
   drafted in the doc as part of this concern pass — confirm it reads
   correctly.)
3. In `docs/open-questions.md`, delete the entire "## Data export" →
   "Vote scope" bullet (it is the only bullet under that heading; remove
   the now-empty "## Data export" heading too).

**Verify:** `grep -n "Option B" docs/data-export.md` shows the decided
wording · `grep -ni "vote scope" docs/open-questions.md` returns nothing

## Phase 1 — RPC + pgTAP

### [x] 1.1 Add `public.export_my_data()` and its pgTAP coverage

**Created:** 2026-06-12T09:57:41Z
**Completed:** 2026-06-12T10:39:47Z

**Why:** The export's data layer and the entire GDPR-portability
guarantee. A single `security definer` RPC returns the caller's whole
per-user document as JSONB; the web layer is just packaging on top.

**Prerequisites:** Task 0.1 (vote scope decided). The data model
(`profiles`, `user_settings`, `lists`, `list_members`, `items`, `votes`,
`relationships`, `invitations`, tombstone user, `public.uid()`) exists
from migrations 0004–0017.

**Decisions:**
- Model the body on `admin.inspect_user` (`0017_admin.sql:185`):
  top-level `jsonb_build_object` of nested subqueries, `SECURITY
  DEFINER`, `SET search_path = public, auth`.
- **Guards first**, mirroring `delete_account()` (0014):
  `uid IS NULL` → `RAISE … USING errcode = '28000'` ('not
  authenticated'); `uid = '00000000-0000-0000-0000-000000000000'` →
  `RAISE … USING errcode = '28000'` ('cannot export the tombstone user').
- Document shape per `data-export.md` § "`data.json` shape": top keys
  `exported_at` (`to_jsonb(now())`), `schema_version` (`1`), `user`,
  `lists`, `circle`, `blocked`, `invitations_sent`, `invitations_received`.
- **`user` is an allowlist** (R4): `id`, `email`, `display_name`,
  `signed_up_at` (`auth.users.created_at`), `invite_policy`
  (`user_settings`), `has_avatar` (`profiles.avatar_version > 0`). Never
  `to_jsonb(u)`.
- **Scoping** (R2): `lists` = lists with a live `list_members` row for
  `uid` (live AND trashed lists — do not filter `lists.deleted_at`);
  `members` = live `list_members` rows as `{id, display_name}` from
  `profiles`; `items` = all items on those lists, live AND soft-deleted,
  with `created_by` `{id, display_name}`, `your_vote` (caller's
  `votes.value` or null), and `all_votes` (Option B: every vote on items
  where `created_by = uid`, as `{user_display_name, value}`; for items
  **not** created by the caller, **omit the `all_votes` key entirely** —
  do not emit `[]`); `circle`/
  `blocked` from `relationships` where `user_id = uid`; invitations where
  `created_by = uid` / `target_user_id = uid`.
- **Invitations are an allowlist, not `to_jsonb(i)` / `jsonb_agg(i)`**
  (R4): each row carries the list name + `list_id`, `created_at`, and the
  other party as a **display name** where one exists. There is **no
  `status` column** on `invitations` — accept/decline *delete* the row
  (`0011_invitations_delete.sql`), so every surviving invite is pending;
  do **not** select `i.status` (it does not exist) and do not synthesise
  a status key. `invitations.target_email` (`0009_invitations.sql:33`) is
  **excluded** — on an email-keyed sent invite it is the invitee's e-mail,
  not the caller's own. An unclaimed email-keyed sent invite renders by
  list name only (no name, no e-mail, no status).
- No email but the caller's appears anywhere (R4).
- Grant: `REVOKE ALL … FROM public; GRANT EXECUTE … TO authenticated;`.
  Single `BEGIN; … COMMIT;` (matches 0014).

**Reference:** `db/tests/admin_inspect.sql` for the sentinel-seed
allowlist test; `db/tests/rpc_delete_account.sql` for guard + grant
assertions and the `list_shared_alice_bob` fixture usage.

**Files:**
- `db/migrations/0018_data_export.sql` (create)
- `db/tests/export_my_data.sql` (create)

**Steps:**
1. RED — Create `db/tests/export_my_data.sql` with `plan(N)`. `\i
   /db/tests/fixtures/list_shared_alice_bob.sql` (Alice+Bob on list
   `11111111`; claims = Alice). As the test superuser, seed: **distinct
   `profiles.display_name` for Alice/Bob/Carol** (`UPDATE public.profiles
   SET display_name = 'Alice'/'Bob'/'Carol' WHERE id = …`) so the
   display-name assertions below are non-vacuous — the signup default is
   the shared placeholder `'New user'`; an item on the shared list
   `created_by` Alice (the **live** item the vote/Option-B asserts use);
   a **second, soft-deleted** item on the shared list `created_by` Alice
   (`deleted_at` set, to prove soft-deleted items carry through, R2);
   a vote on the live item by Bob and a vote by Alice; a
   `relationships` row Alice→Carol `status='circle'` and Alice→Bob
   `status='blocked'`; a **user-keyed** `invitations` row created_by
   Alice (e.g. `target_user_id` = Carol) for `invitations_sent`; a
   **received** `invitations` row created_by Bob with `target_user_id` =
   Alice, for `invitations_received`; an **email-keyed** `invitations`
   row created_by Alice with `target_email = 'dave@test'`,
   `target_user_id` NULL (to exercise the `target_email` exclusion); a
   second list with only Bob (Alice not a member); a **trashed** list
   (`deleted_at` set) that Alice **is** a member of (to prove trashed
   lists carry through, R2); and sentinel values in
   every `auth.users` credential/token column on Alice (copy the `UPDATE
   auth.users SET encrypted_password='SENTINEL-…', …` block from
   `admin_inspect.sql`). Capture `public.export_my_data()` into a temp
   table under Alice's claims. Assert:
   (a) `user->>'email'` = Alice's, `user->>'display_name'` present,
   `user->>'has_avatar'` = `false`, `schema_version` = 1;
   (b) every credential/token column key is **absent** from `user`
   (`NOT jsonb_exists(j->'user', 'encrypted_password')`, … one per
   column, as in `admin_inspect.sql`);
   (c) the shared list appears in `lists`; the **trashed list Alice is a
   member of also appears**, with its `deleted_at` non-null; the Bob-only
   list does **not**; the **soft-deleted item appears** in the shared
   list's `items` with its `deleted_at` non-null (alongside the live item);
   (d) the Alice-created (live) item's `all_votes` includes Bob's value by
   `user_display_name` (Option B), and `your_vote` is Alice's value;
   (e) `circle` contains Carol by display name, `blocked` contains Bob;
   `invitations_sent` is non-empty; `invitations_received` contains the
   Bob→Alice invite with Bob rendered by display name;
   (f) no email but Alice's appears — assert the document text cast
   `(j::text NOT LIKE '%bob@test%')`, same for `carol@test`, **and same
   for `dave@test`** (the email-keyed invite's `target_email`, which the
   invitation allowlist must exclude); also assert
   `invitations_sent` is present and renders the unclaimed email-keyed
   invite by list name with **no** e-mail key (and no `status` key);
   (g) guards: claims unset → `28000`; claims = tombstone → `28000`
   (use `throws_ok` with `SET LOCAL ROLE authenticated` + `set_config`);
   (h) grant matrix: `has_function_privilege('authenticated',
   'public.export_my_data()', 'EXECUTE')` true; `anon` and `public`
   false.
2. RED — Run `./scripts/test-db.sh` and confirm `export_my_data.sql`
   reports red (function does not exist).
3. GREEN — Create `db/migrations/0018_data_export.sql`: a single
   `BEGIN; … COMMIT;` defining `public.export_my_data()` per Decisions,
   then the revoke/grant. Build `lists`/`items` with `jsonb_agg` over
   correlated subqueries (coalesce empty aggregates to `'[]'::jsonb`, as
   `0015_public_lists.sql` does).
4. GREEN — Re-run `./scripts/test-db.sh`; confirm green.

**Verify:** `./scripts/test-db.sh`

## Phase 2 — Settings row + raw-JSON download

### [x] 2.1 Add the export document types and the export state machine (RPC + raw download)

**Created:** 2026-06-12T09:57:41Z
**Completed:** 2026-06-12T10:50:45Z

**Why:** The web layer's foundation — a typed view of the RPC document
and a testable state machine that calls the RPC and, in this first
slice, downloads `data.json` directly (no ZIP yet). This is the smallest
UI that satisfies GDPR portability.

**Prerequisites:** Task 1.1 (`/rpc/export_my_data` exists). `pgPost`
from `web/src/lib/shared/http/postgrest.ts`.

**Decisions:**
- `types.ts` mirrors `data-export.md` § "`data.json` shape":
  `ExportDocument`, `ExportUser`, `ExportList`, `ExportMember`,
  `ExportItem`, `ExportVote`, `ExportRelationship`, `ExportInvitation`.
- `all_votes` is **omitted** on items the caller didn't add (R3), so it
  is optional on the type (`all_votes?: ExportVote[]`); `render-html` and
  `archive` must read absent as "no co-author votes", never error on it.
  `ExportInvitation` has **no `status` field** (invites are pending-only).
- `export.svelte.ts` exposes runes state: `status` (`'idle' |
  'packaging' | 'ready' | 'error'`), `result` (`{ blob, fileName } |
  null`), `error` (string | null), and `prepare()`, `download()`,
  `reset()`.
- For this task `prepare()` calls `pgPost<ExportDocument>('/rpc/export_my_data', {})`,
  and (no ZIP yet) sets `result` to a `Blob` of the pretty-printed JSON
  named `data.json`; on `ApiError` sets `status='error'`. `download()`
  uses `URL.createObjectURL` + a synthesized `<a download>` then revokes
  the URL (see `AvatarCropScreen.svelte` for the `createObjectURL`
  idiom). Phase 3 swaps the Blob builder for the real ZIP.
- Module is reactive via runes; do not wrap a `Map`/`Set` in `$state`.

**Files:**
- `web/src/lib/export/model/types.ts` (create)
- `web/src/lib/export/state/export.svelte.ts` (create)
- `web/src/lib/export/state/export.test.ts` (create)

**Steps:**
1. RED — Write `export.test.ts`: with MSW stubbing `POST
   */rpc/export_my_data` to return a fixture `ExportDocument`,
   `prepare()` transitions `idle → packaging → ready` and populates
   `result.fileName === 'data.json'`; on a 500 it transitions to
   `'error'` with a message; `reset()` returns to `idle`. Use the MSW
   `server.use(...)` pattern from `$lib/test/`.
2. RED — `cd web && pnpm test export.test` → red (module absent).
3. GREEN — Implement `types.ts` and `export.svelte.ts` per Decisions.
4. GREEN — `cd web && pnpm test export.test` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [x] 2.2 Add the "Privacy & data → Download my data" Settings row and the export route

**Created:** 2026-06-12T09:57:41Z
**Completed:** 2026-06-12T11:45:10Z

**Why:** The entry point (R6) and the route that hosts the hub. With the
minimal hub from this task, a user can already prepare and download their
`data.json`.

**Prerequisites:** Task 2.1 (`export.svelte.ts`, `types.ts`).

**Decisions:**
- New `<section class="preference-group">` in `SettingsScreen.svelte`
  titled "Privacy & data". The artboard
  (`design/cairn-export-screens.jsx` § 1) and `docs/ui.md` § Settings show
  it **immediately adjacent to Recovery**, but the live screen has
  "Appearance" and "Text size" sitting between "People" and "Recovery"
  (current order: Profile, People, Appearance, Text size, Recovery,
  Account). **Insert it immediately *before* the "Recovery" section**
  (i.e. after "Text size"), so Privacy & data → Recovery → Account form
  the contiguous data/account cluster the artboard depicts. One
  `NavRow`: title "Download my data", `lead` `<Icon name="download"
  size={20} />`, `sub` "A copy of everything Cairn stores",
  `data-test="settings-download-data"`, `onclick={() =>
  goto(resolve('/settings/data-export'))}`.
- New route `web/src/routes/(app)/settings/data-export/+page.svelte`
  renders `ExportHubScreen`. A minimal `ExportHubScreen` for this task:
  `AppTopBar` "Download my data", explanation copy, a "Prepare my
  download" `Button` calling the machine's `prepare()`, and — when
  `status==='ready'` — a "Download" button calling `download()`. Full
  three-state polish lands in Task 3.3.
- Toolchain coupling: `resolve('/settings/data-export')` only type-checks
  once the route file exists — so create the route file in this task
  (same task as the Settings edit), and the `ExportHubScreen` it imports.

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)
- `web/src/lib/export/components/ExportHubScreen.svelte` (create)
- `web/src/lib/export/components/ExportHubScreen.test.ts` (create)
- `web/src/routes/(app)/settings/data-export/+page.svelte` (create)
- `web/src/routes/(app)/settings/data-export/page.test.ts` (create)

**Steps:**
1. RED — Extend `SettingsScreen.test.ts`: a row with
   `data-test="settings-download-data"` renders, and clicking it calls
   `goto` with the resolved `/settings/data-export` path (mock
   `$app/navigation` as the existing test does).
2. RED — Write `ExportHubScreen.test.ts`: renders the "Prepare my
   download" button; clicking it invokes `prepare()` (mock the state
   module); when `status==='ready'`, a "Download" button renders and
   clicking calls `download()`. Write `page.test.ts` asserting the route
   renders `ExportHubScreen`.
3. RED — `cd web && pnpm test` → red.
4. GREEN — Add the section/row to `SettingsScreen.svelte`; create
   `ExportHubScreen.svelte` (minimal) and the route wrapper.
5. GREEN — `cd web && pnpm test` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

**Notes:**
- User refined the hub UI directly during the task: the "What's inside"
  / "Two formats" labels became `<h2>` (matching a parallel `Label`→`<h2>`
  swap they made in `DeleteAccountScreen.svelte`), the formats list became a
  `<dl>`, the action buttons are centred (`.actions` flex column), and the
  `dd` is indented under its `dt`. The component's behaviour (prepare/ready/
  download toggle) and its tests are unchanged.
- Side work: removed a now-dead `import Label` from `DeleteAccountScreen.svelte`
  left over from the user's in-progress `Label`→`<h2>` edit (it was an unstaged
  working-tree change). The `Label` component is still used in ~9 other files
  (form-field labels), so it is not being retired — only those section
  headings changed.
- `pnpm lint` here runs ESLint only; Prettier is a separate pre-commit gate,
  run explicitly. Consistent with the 2.1 note.

## Phase 3 — HTML + README + ZIP

### [ ] 3.1 Render `data.html`, `README.html`, and `README.md` from the JSON

**Created:** 2026-06-12T09:57:41Z
**Completed:**

**Why:** R8 — most users open the HTML, not the JSON. The renderings are
generated from the canonical JSON and must contain no JavaScript. This
lands **before** the archive builder (Task 3.2), which imports these
renderers — so the consumer is never written against a missing module.

**Prerequisites:** Task 2.1 (`types.ts`).

**Decisions:**
- Pure functions in `render-html.ts`: `renderDataHtml(doc)`,
  `renderReadmeHtml(doc)`, `renderReadmeMarkdown(doc)`. All return
  strings; **no `<script>`** in any output.
- `data.html` renders user, lists (with members, items, votes), circle,
  blocked, and invitations as static sections, and links rows back to
  their `data.json` path (e.g. an anchor/label citing `lists[0].items[2]`)
  per `docs/data-export.md` § "Format". Escape all interpolated user text
  (names, notes) to prevent HTML injection into the archive.
- READMEs explain what each file is and that JSON is canonical.

**Files:**
- `web/src/lib/export/model/render-html.ts` (create)
- `web/src/lib/export/model/render-html.test.ts` (create)

**Steps:**
1. RED — Write `render-html.test.ts`: output of each renderer contains
   the user's display name and a list/item name; `renderDataHtml` output
   contains **no** `<script` substring; a name containing `<b>` is
   HTML-escaped (no raw tag in output); the README mentions `data.json`.
2. RED — `cd web && pnpm test render-html.test` → red.
3. GREEN — Implement the three renderers with an internal `escapeHtml`
   helper.
4. GREEN — `cd web && pnpm test render-html.test` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [ ] 3.2 Add `jszip` and the archive builder

**Created:** 2026-06-12T09:57:41Z
**Completed:**

**Why:** R8 — the deliverable is a ZIP, not a bare JSON. Centralise
filename and archive assembly in one tested module.

**Prerequisites:** Task 2.1 (`types.ts`); Task 3.1 (the `render-html.ts`
renderers `buildArchive` imports — landed first so this task has no
missing import to stub).

**Decisions:**
- Add `jszip` to `web/package.json` `dependencies` (the user approved a
  runtime dep over a hand-rolled encoder).
- `exportFileName(doc)` → `cairn-export-{yyyymmdd}-{shortid}.zip`, where
  `yyyymmdd` derives from `doc.exported_at` and `shortid` is a short
  random base36 string. Keep date derivation pure by reading
  `doc.exported_at` (do not call `Date.now()` for the date).
- `buildArchive(doc, avatars)` returns a `Blob`
  (`zip.generateAsync({ type: 'blob' })`) containing `data.json`,
  `data.html`, `README.html`, `README.md`, and any provided avatar
  entries (`avatar.webp`, `avatars/{uid}.webp`). `avatars` is a small
  structure of `{ name, bytes }`; an empty list adds no avatar entries.
  HTML/README content comes from Task 3.1's renderers (already landed).

**Files:**
- `web/package.json` (modify)
- `web/src/lib/export/model/archive.ts` (create)
- `web/src/lib/export/model/archive.test.ts` (create)

**Steps:**
1. GREEN-first (dependency) — `cd web && pnpm add jszip`.
2. RED — Write `archive.test.ts`: `exportFileName` matches
   `/^cairn-export-\d{8}-[a-z0-9]+\.zip$/` and embeds the
   `exported_at` date; `buildArchive` produces a Blob that, when re-read
   with `JSZip.loadAsync`, contains exactly `data.json`, `data.html`,
   `README.html`, `README.md` (plus avatar entries when supplied), and
   `data.json` parses back to the input document.
3. RED — `cd web && pnpm test archive.test` → red.
4. GREEN — Implement `archive.ts`, importing the Task 3.1 renderers for
   the HTML/README entries.
5. GREEN — `cd web && pnpm test archive.test` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [ ] 3.3 Wire the ZIP into the state machine and flesh out the three-state hub

**Created:** 2026-06-12T09:57:41Z
**Completed:**

**Why:** R7, R8 — replace the raw-JSON slice with the real ZIP, and
build the idle/packaging/ready (and error) states the design specifies.

**Prerequisites:** Tasks 2.1, 2.2, 3.1, 3.2.

**Decisions:**
- In `export.svelte.ts`, `prepare()` now: `status='packaging'` → call
  the RPC → `buildArchive(doc, [])` (avatars added in Phase 4) →
  `result = { blob, fileName: exportFileName(doc) }` → `status='ready'`;
  on error `status='error'`.
- `ExportHubScreen.svelte` renders by `status` (R7; artboards 2–4 in
  `design/cairn-export-screens.jsx`): **idle** = "Take everything with
  you" heading, the italic subhead "A single ZIP file. Yours forever.
  Nothing in it phones home." (artboard 2, rendered via the global
  italic/serif rule — no hard-coded font), the "What's inside" / "Two
  formats" card, and "Prepare my download" + the muted "may take a few
  seconds" note; **packaging** =
  centered **blinking `feather` glyph** (artboard 3 animates the feather
  icon, not a spinner) + "Packaging your data…" (progress copy is
  intentionally **generic** per `docs/data-export.md` §4 — do **not** wire
  the artboard's live counts "Reading 5 lists, 47 items…", which add count
  plumbing for no functional gain); **ready** = check disc,
  "Ready", a monospace filename chip showing `result.fileName`, and a
  "Download" button calling `download()`. **Affordance divergence
  resolved in favour of the explicit button** (R7 / doc step 4): the
  artboard's auto-save copy "Your browser is saving the file now."
  (`cairn-export-screens.jsx:172`) assumes the file downloads on entering
  `ready`; we use a button instead, so the ready sub-copy must match a
  *click-to-save* flow — use "Your archive is ready to download." rather
  than "saving now". Keep the artboard's italic note pair: "Open the
  README.html first — it explains what each file is." + "Your archive is
  valid until you close this page." The filename-chip file-size (artboard
  shows `2.4 MB`) is **optional polish — omit in v1** (it adds a
  blob-size read for no functional gain); if added later it derives from
  `result.blob.size`. **error** = a recoverable message + "Try again"
  calling `reset()`/`prepare()`. Layout local in `<style>`; colour/type
  via tokens and global classes (`docs/ui.md`).

**Files:**
- `web/src/lib/export/state/export.svelte.ts` (modify)
- `web/src/lib/export/state/export.test.ts` (modify)
- `web/src/lib/export/components/ExportHubScreen.svelte` (modify)
- `web/src/lib/export/components/ExportHubScreen.test.ts` (modify)

**Steps:**
1. RED — Update `export.test.ts`: after `prepare()`, `result.fileName`
   matches the `cairn-export-…zip` pattern and `result.blob` is a
   non-empty Blob (MSW returns a fixture document). Update
   `ExportHubScreen.test.ts` to assert each `status` renders its
   distinctive element (prepare button / spinner text / filename chip +
   download / try-again).
2. RED — `cd web && pnpm test` → red.
3. GREEN — Swap the JSON-blob builder for `buildArchive` + `exportFileName`
   in `prepare()`; expand `ExportHubScreen.svelte` to the four states.
4. GREEN — `cd web && pnpm test` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

## Phase 4 — avatar embeds

### [ ] 4.1 Embed the caller's and co-members' avatars, best-effort

**Created:** 2026-06-12T09:57:41Z
**Completed:**

**Why:** R9 — the archive includes the user's photo and co-members'
photos at export time, without letting a missing avatar break the export.

**Prerequisites:** Task 3.3 (`prepare()` builds the ZIP).

**Decisions:**
- In `prepare()`, before `buildArchive`, gather avatar bytes: fetch
  `/avatars/{uid}.webp` for the caller (`doc.user.id`) → `avatar.webp`,
  and for each **distinct** co-member `id` across `doc.lists[].members`
  and `doc.lists[].items[].created_by` (excluding the caller and the
  tombstone `00000000-…`) → `avatars/{uid}.webp`.
- Best-effort: `fetch` with no auth header needed (Caddy serves these
  publicly); on any non-`res.ok` or thrown error, skip that avatar.
  Collect successes as `{ name, bytes }` and pass to `buildArchive`.
- No `avatar_version` query param — a one-shot fetch doesn't need the
  cache-buster, and "no picture" simply 404s (`docs/avatars.md`).

**Files:**
- `web/src/lib/export/state/export.svelte.ts` (modify)
- `web/src/lib/export/state/export.test.ts` (modify)

**Steps:**
1. RED — Extend `export.test.ts` with MSW handlers for `*/avatars/*`:
   the caller's avatar returns 200 with bytes → archive contains
   `avatar.webp`; one co-member returns 200 → archive contains
   `avatars/{thatUid}.webp`; another co-member returns 404 and a third
   throws → both omitted, `status` still reaches `'ready'`. Assert the
   tombstone id is never fetched.
2. RED — `cd web && pnpm test export.test` → red.
3. GREEN — Implement the dedup + best-effort fetch in `prepare()`.
4. GREEN — `cd web && pnpm test export.test` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

## Phase 5 — delete-account integration + e2e

### [ ] 5.1 Wire the Delete-account "Download" button to the export hub

**Created:** 2026-06-12T09:57:41Z
**Completed:**

**Why:** R10 — the courtesy nudge to grab a copy before deleting. The
button already exists, disabled, with a `TODO(step-12)`.

**Prerequisites:** Task 2.2 (the `/settings/data-export` route exists, so
`resolve()` type-checks).

**Decisions:**
- In `DeleteAccountScreen.svelte`, remove `disabled` from the
  `delete-account-export-download` `Button`, add `onclick={() =>
  goto(resolve('/settings/data-export'))}`, and remove **both** stale
  step-12 comments: the explanatory comment above the card ("Download is
  disabled until export lands (step 12)", ~line 72) and the inline
  `TODO(step-12)` (~line 79). Independent flow — back returns to this
  screen; the delete gate is untouched.

**Files:**
- `web/src/lib/account/components/DeleteAccountScreen.svelte` (modify)
- `web/src/lib/account/components/DeleteAccountScreen.test.ts` (modify)

**Steps:**
1. RED — Update `DeleteAccountScreen.test.ts`: the existing assertion
   that `delete-account-export-download` is `disabled` is replaced by one
   asserting it is **enabled** and that clicking it calls `goto` with the
   resolved `/settings/data-export` path (mock `$app/navigation`).
2. RED — `cd web && pnpm test DeleteAccountScreen` → red.
3. GREEN — Apply the edits to `DeleteAccountScreen.svelte`.
4. GREEN — `cd web && pnpm test DeleteAccountScreen` → green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [ ] 5.2 Playwright happy path for the export flow

**Created:** 2026-06-12T09:57:41Z
**Completed:**

**Why:** R6–R10 end-to-end — prove a real user can sign in, prepare, and
download a valid archive, and that the delete-account link reaches the hub.

**Prerequisites:** Tasks 2.2, 3.3, 4.1, 5.1.

**Decisions:**
- Follow `web/e2e/delete-account.spec.ts`: Mailpit sign-in via
  `waitForMagicLink` (`web/e2e/helpers/mailpit.ts`), then drive the UI.
- Capture the download with Playwright's `page.waitForEvent('download')`
  around the "Download" click; save it and re-open with a ZIP reader (or
  assert the suggested filename matches `cairn-export-…\.zip` and the
  saved file is a non-empty ZIP — magic bytes `PK`). Keep the assertion
  resilient (don't over-specify byte counts).

**Files:**
- `web/e2e/export.spec.ts` (create)

**Steps:**
1. Sign in via Mailpit; go to `/settings`; click
   `settings-download-data`; expect URL `/settings/data-export`.
2. Click "Prepare my download"; wait for the ready state (filename chip
   visible).
3. Click "Download" inside `page.waitForEvent('download')`; assert the
   suggested filename matches `cairn-export-\d{8}-…\.zip` and the saved
   file begins with the `PK` ZIP magic bytes.
4. Separately: from `/settings/delete-account`, click
   `delete-account-export-download`; expect URL `/settings/data-export`.

**Verify:** `cd web && pnpm test:e2e export` · `./scripts/check.sh --e2e`

**Notes:**
- (fill on completion — e.g. whether the harness needed a ZIP-reader dep
  in `devDependencies` for the download assertion.)
