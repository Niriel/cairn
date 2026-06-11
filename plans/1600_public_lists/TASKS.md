# Tasks

## Reference skills and docs

- **`docs/data-model.md`** — RLS conventions, `public.is_list_member`,
  `items_ranked` (`security_invoker = TRUE`), the grant matrix, the
  `create_list` RPC pattern.
- **`docs/testing.md`** — three test layers; pgTAP needs positive *and*
  negative cases for any boundary change.
- **`docs/ui.md`** — TopBar, overflow-sheet button order (destructive last),
  the copy-link convention, public-marker placement.
- **`.claude/skills/writing-tasks.md`** — route-colocated test files drop the
  `+` prefix; watch cross-task toolchain coupling for not-yet-created routes.
- **Project memory** — Playwright is machine-conditional: on the laptop
  it cannot run (write specs, report unrunnable, never claim a pass); on the work
  box the **chromium + firefox** projects run, **webkit** does not. `Icon.svelte`
  takes no colour prop (set colour via CSS on a wrapping container); the local DB
  stack hangs when a VPN is connected — disconnect the VPN before
  `./scripts/test-db.sh`.

## Phase 0 — reconcile docs

### [x] 0.1 Document the anon read path before code lands

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T20:32:48Z

**Why:** This feature opens `anon` to exactly one read-only RPC, which
contradicts the current docs stating `anon` has zero access. Downstream steps
(and future plans) reference these docs as the spec, so the doc edit lands
first.

**Prerequisites:** None.

**Decisions:**
- `anon`'s entire surface is one `SECURITY DEFINER` function,
  `public.public_list_view(uuid)`; it still has **no** table/view/other-RPC
  grant. Document this explicitly, including *why* a direct table grant was
  rejected (`items_ranked` is `security_invoker`, so it yields nothing for
  `anon`, and a definer view would leak all lists' scores).
- `lists.is_public boolean NOT NULL DEFAULT false`; any member may toggle it via
  the existing `lists_update` policy (no new write policy).
- UI: a public marker (globe icon + "Public list" label) after the list name in
  member views only; a publish/unpublish + copy-link action in the overflow
  sheet (destructive actions stay last); a read-only `/p/<list_id>` page. The
  copy-link is Cairn's **first** clipboard affordance — this doc *establishes*
  the convention (label, what's copied, and visible "Copied" feedback); there is
  no pre-existing convention to reference.
- The "Anonymous users have no access to any table" line lives in
  `docs/data-model.md` (≈ line 371), **not** `docs/architecture.md`.
  `docs/open-questions.md` has **no** public-lists entry — public lists were
  never an open question, so there is nothing to "resolve" there.

**Files:**
- `docs/data-model.md` (modify)
- `docs/architecture.md` (modify)
- `docs/ui.md` (modify)

**Steps:**
1. In `docs/data-model.md`, add the `is_public` column to the `lists`
   description and a subsection documenting `public_list_view` as the sole anon
   read path (curated payload: id/name/description + items id/name/notes/score
   ordered by score; no members, votes, or attribution; `null` for
   non-public/deleted/unknown). Note the rejected table-grant alternative. Amend
   the "Anonymous users have no access to any table" line (≈ line 371): `anon`
   still touches **no** table or view, but now has EXECUTE on exactly one
   `SECURITY DEFINER` RPC; everything else stays closed.
2. In `docs/architecture.md`, *add* a one-line note to the request-flow/`anon`
   description (there is no blanket "no access" statement to amend — only the
   auth-proxy text): `anon` has exactly one read-only RPC; everything else stays
   closed; no Caddy/compose/auth-proxy change is required.
3. In `docs/ui.md`, document the member-only public marker (globe), the
   publish/copy-link affordance — establishing the copy-link convention
   including the visible "Copied" feedback — and its position above the
   destructive actions, and the read-only public screen.
4. `docs/open-questions.md`: no existing entry to resolve; add a one-line decided
   note (public = unlisted/link-only; members hidden; any member may publish; the
   list id is the link) only if it fits the file's structure, otherwise skip.

**Verify:** `git diff --stat docs/` · manual read-through for consistency.

**Notes:** Step 4 (`open-questions.md`) skipped per the task's conditional —
the file tracks only *pending* decisions and deletes them once settled, so a
"decided" note doesn't fit its structure, and public lists were never an open
question there. Spot-ran `cspell` on the three docs: all 14 flagged words are
pre-existing (timestamptz, EDPB, narrowings, …) in untouched lines; my added
prose introduced none.

## Phase 1 — DB foundation

### [x] 1.1 Add `is_public` column, index, and the `public_list_view` RPC

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T20:39:16Z

**Why:** The flag (R1) and the curated anonymous read path (R3–R5) are the
foundation everything else builds on. A single `SECURITY DEFINER` RPC is the
only thing `anon` may touch; it hides members/votes/attribution by
construction.

**Prerequisites:** None (extends `db/migrations/0004_domain_schema.sql`'s
schema; reuses `public.items_ranked` and the `create_list` RPC pattern).

**Decisions:**
- Column: `ALTER TABLE public.lists ADD COLUMN is_public boolean NOT NULL
  DEFAULT false;`. **No extra index** — the only public read path is a point
  lookup on the PK (`l.id = p_id`), already served by the primary-key index; a
  partial `(id) WHERE is_public` index would never be chosen by the planner and
  supports no other query (discovery/browse is a non-requirement).
- No new write policy/grant for the toggle: `authenticated` already has
  `GRANT UPDATE ON public.lists` and `lists_update` (`is_list_member(id)`)
  authorises any member — assertion only (Task 1.2).
- RPC body (curated payload; `score` from `items_ranked`, which the definer can
  read even though `anon` cannot):
  ```sql
  CREATE FUNCTION public.public_list_view(p_id uuid)
  RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public AS $$
    SELECT jsonb_build_object(
      'id', l.id, 'name', l.name, 'description', l.description,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', r.id, 'name', r.name, 'notes', r.notes, 'score', r.score)
                 ORDER BY r.score DESC, r.created_at ASC)
        FROM public.items_ranked r WHERE r.list_id = l.id), '[]'::jsonb))
    FROM public.lists l
    WHERE l.id = p_id AND l.is_public AND l.deleted_at IS NULL;
  $$;
  REVOKE EXECUTE ON FUNCTION public.public_list_view(uuid) FROM public;
  GRANT EXECUTE ON FUNCTION public.public_list_view(uuid) TO anon, authenticated;
  ```
  When no row matches the `WHERE` (private / soft-deleted / unknown), the SQL
  function returns `NULL` (zero rows) — no `CASE` guard needed; that is the
  R5 boundary.
- Confirm the function owner (migration superuser, not `authenticated`) can read
  `items_ranked`/`votes` so the definer aggregate computes; `items_ranked` is
  `security_invoker = TRUE`, so under a definer-owned function the owner's RLS
  applies — verify the score is non-null in the pgTAP positive case.
- Migration follows the existing style: `REVOKE … FROM public` then `GRANT …`;
  `LANGUAGE sql STABLE SET search_path = public`; record in `public._migrations`
  via `scripts/migrate.sh` automatically.

**Reference:** `db/migrations/0004_domain_schema.sql:586` (`create_list` RPC
shape), `:782` (`items_ranked` definition), `:854` (grant matrix).

**Files:**
- `db/migrations/0015_public_lists.sql` (create)
- `db/tests/public_lists.sql` (create)
- `db/tests/fixtures/` (modify — add a public list and a private list)

**Steps:**
1. RED — Create `db/tests/public_lists.sql` with `plan(N)`. As the `anon` role
   (`SET LOCAL ROLE anon`, empty `request.jwt.claims`): (a) `public_list_view`
   of the public fixture returns a non-null object with the right name and
   ranked items (assert `score` present and order); (b) of a **private** list →
   `NULL`; (c) of a **soft-deleted** public list → `NULL`; (d) of an unknown
   uuid → `NULL`; (e) the returned JSON has **no** `created_by`/`modified_by`
   key and no member/vote data; (f) soft-deleted items are absent from a public
   list's payload.
2. RED — Add the public/private fixtures under `db/tests/fixtures/` (reuse the
   alice/bob/carol users; one list `is_public = true` with a couple of voted
   items, one `is_public = false`).
3. RED — Run `./scripts/test-db.sh`; confirm the new file reports red (function
   absent).
4. GREEN — Create `db/migrations/0015_public_lists.sql` with the column, RPC,
   and execute grant per Decisions (no extra index).
5. GREEN — Re-run `./scripts/test-db.sh`; confirm `public_lists.sql` green.

**Verify:** `./scripts/test-db.sh`

### [x] 1.2 Lock the anon boundary and member-toggle in pgTAP

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T20:46:48Z

**Why:** Opening `anon` even slightly demands that the rest of the boundary be
re-asserted: `anon` still reads no tables/views and calls no other RPC (R3), and
the toggle is members-only (R2). RLS is the security boundary; an untested
boundary is an unverified claim.

**Prerequisites:** Task 1.1 (`is_public` column and `public_list_view` exist).

**Decisions:**
- `grants.sql` already enumerates `anon` negatives — keep them, and add: `anon`
  *can* `EXECUTE public.public_list_view(uuid)`, but still **cannot** `SELECT`
  `lists`/`items`/`items_ranked`/`list_members`/`profiles`/`votes`, and cannot
  execute `create_list` or other RPCs.
- Member toggle: as a member (set `request.jwt.claims.sub` to a member uuid,
  `SET LOCAL ROLE authenticated`), `UPDATE public.lists SET is_public = true`
  succeeds; as a non-member it affects **zero rows** (blocked by `lists_update`).

**Reference:** `db/tests/grants.sql` (existing anon negative pattern,
`has_table_privilege`/`has_function_privilege`); `db/tests/rls_lists.sql`
(role-switch + `set_config` pattern).

**Files:**
- `db/tests/grants.sql` (modify)
- `db/tests/public_lists.sql` (modify — add the toggle assertions)

**Steps:**
1. RED — In `grants.sql`, add the positive `has_function_privilege('anon',
   'public.public_list_view(uuid)', 'execute')` and add the `anon`
   no-SELECT negatives for the views (`items_ranked`, `items_deleted`,
   `lists_deleted`) — these aren't currently asserted — alongside the existing
   table/other-RPC negatives. Bump `plan()` **and** update the file's header
   comment block (the total and the group breakdown are already stale: it says
   "60 assertions" while the code is `plan(84)`; don't compound the drift).
2. RED — In `public_lists.sql`, add member-success and non-member-zero-rows
   assertions for `UPDATE … SET is_public`. Bump `plan()`.
3. RED — Run `./scripts/test-db.sh`; confirm red where expected.
4. GREEN — No migration change needed (boundary already correct from Task 1.1
   and existing grants); re-run `./scripts/test-db.sh` until green. If any
   negative fails, fix the grant/policy in `0015_public_lists.sql` — do **not**
   weaken the test.

**Verify:** `./scripts/test-db.sh`

**Notes:**
- No genuine RED phase: as the task itself anticipated (step 4), the boundary
  was already correct from Task 1.1, so all seven new assertions passed on the
  first run with no migration change. The "red" was confined to confirming the
  `plan()` counts.
- `grants.sql`: +5 assertions (`plan(84)` → `plan(89)`). The stale header
  ("60 assertions") was rewritten to the true per-group counts (A=19, B=18,
  C=4, D=48). Added one `authenticated` EXECUTE positive and one `anon` EXECUTE
  positive for `public_list_view`, plus the three `anon` no-SELECT view
  negatives (`items_ranked`, `items_deleted`, `lists_deleted`). Group D was
  reframed from "negatives only" to "one positive + negatives".
- `public_lists.sql`: +2 assertions (`plan(14)` → `plan(16)`) for the
  member-publish / non-member-zero-rows toggle, exercised on the private
  fixture list so they don't couple to the soft-delete assertion.
- **User correction:** mid-task the user flagged that referring to requirements
  by number (`R2`, `R5`, …) is meaningless — twenty-plus plans each have their
  own `R2`. Removed the `R3–R5` / `R2` / `R5` references I'd written in the
  migration and test comments, and added durable guidance to
  `.claude/commands/work.md` ("Don't refer to requirements by number"). The
  pre-existing `R15` / `Risk #6` references in the `grants.sql` header predate
  this work and were left untouched.

## Phase 2 — publish toggle and member-facing marker

### [x] 2.1 Surface `is_public` in the list type and queries

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T20:51:55Z

**Why:** The marker (R7) and toggle (R2, R8) need `is_public` on the client. It
must be selected wherever a member view renders a list.

**Prerequisites:** Task 1.1 (column exists).

**Decisions:**
- Add `is_public: boolean` to the `List` type in
  `web/src/lib/list/model/list.ts`.
- Add `is_public` to the collection `select=` in
  `web/src/lib/list/state/lists.svelte.ts` and to the `ListMeta` select in
  `web/src/lib/item/components/ItemsScreen.svelte` (`reloadMeta`).

**Files:**
- `web/src/lib/list/model/list.ts` (modify)
- `web/src/lib/list/state/lists.svelte.ts` (modify)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)

**Steps:**
1. RED — In the relevant `*.test.ts` (e.g. `lists.svelte.ts` state test),
   assert the fetched list exposes `is_public`. Update mocks under
   `web/src/lib/list/components/__mocks__` / state mocks to include the field.
2. GREEN — Add the field to the type and both `select=` strings.
3. GREEN — `pnpm check` (types) and `pnpm test` green.

**Verify:** `cd web && pnpm check` · `pnpm test`

### [x] 2.2 Add publish/unpublish and copy-link to the overflow sheet

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T20:59:12Z

**Why:** Members need to publish/unpublish a list and copy its public link
(R2, R8).

**Prerequisites:** Task 2.1 (`is_public` available); Task 1.1 (`lists_update`
already authorises the write).

**Decisions:**
- Add a `setPublic(listId, value)` action in
  `web/src/lib/list/state/lists.svelte.ts` that `pgPatch`es
  `/lists?id=eq.<id>` with `{ is_public: value }` and updates local state — it
  must mutate the matching `lists.items` entry's `is_public` **in place** (not
  replace the array element), so the collection-row marker and any open overflow
  sheet that received a `lists.items` element stay reactive.
- `ListOverflowSheet.svelte` gains an `isPublic: boolean` prop. The sheet is
  mounted from **two** call sites and **both** must pass it: the collection
  (`ListsScreen.svelte`, from `overflowList.is_public`) and the detail screen
  (`ItemsScreen.svelte`, from `listMeta.is_public`). `ListsScreen.svelte` and
  `ItemsScreen.svelte` are therefore in this task's Files.
- **Detail-screen freshness:** `ItemsScreen` renders from its own `listMeta`
  state (separate from `lists.items`), which `setPublic` does not touch. So on
  the detail screen, after a successful toggle, re-run `reloadMeta()` (or update
  `listMeta.is_public` locally) so the TopBar marker (Task 2.3) and the sheet
  label reflect the change immediately — don't rely on `setPublic`'s
  `lists.items` write alone.
- In `ListOverflowSheet.svelte`, add a "Make public" / "Make private" row
  (label reflects `isPublic`) and, when public, a "Copy public link" row copying
  `<origin>/p/<list_id>` (use `window.location.origin`). Place both with the
  management actions, **above** Leave/Delete (button-order rule).
- **Copy feedback:** the copy action must give visible confirmation — a
  transient "Copied" state on the row (or a short snackbar). A silent copy is a
  least-surprise violation, and there is no prior clipboard convention to
  inherit (this plan's Phase 0 defines it). Assert the feedback in the test.
- Follow the existing row pattern in `ListOverflowSheet.svelte`; the copy-link
  affordance is the one defined in `docs/ui.md` by Phase 0 (Task 0.1).

**Files:**
- `web/src/lib/list/state/lists.svelte.ts` (modify)
- `web/src/lib/list/components/ListOverflowSheet.svelte` (modify)
- `web/src/lib/list/components/ListOverflowSheet.test.ts` (modify)
- `web/src/lib/list/components/ListsScreen.svelte` (modify — pass `isPublic`)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify — pass `isPublic`;
  refresh `listMeta` after toggle)

**Steps:**
1. RED — In `ListOverflowSheet.test.ts`: with `isPublic={false}` the sheet shows
   "Make public" and no copy-link, and clicking it calls the patch action; with
   `isPublic={true}` it shows "Make private" and a "Copy public link" row that
   writes `<origin>/p/<id>` to the clipboard (mock `navigator.clipboard`) and
   surfaces the "Copied" feedback.
2. GREEN — Implement `setPublic` (in-place `lists.items` update) in state, the
   `isPublic` prop + the two rows + copy feedback in the sheet, and thread
   `isPublic` from both call sites (refreshing `listMeta` in `ItemsScreen` after
   a successful toggle).
3. GREEN — `pnpm test` green.

**Verify:** `cd web && pnpm test` · `pnpm check` · `pnpm lint`

**Notes:**
- **Icon side work (overlaps Task 2.3's Files):** the overflow rows follow the
  existing icon+label pattern, so they need icons that don't exist yet. Added
  **`globe`** (the exact path Task 2.3 specifies) and **`link`** to
  `web/src/lib/basic/model/icon-paths.ts`. The publish toggle uses `globe` — so
  the sheet and the marker Task 2.3 adds share one icon for "public" — and the
  copy-link row uses `link`, swapping to `check` during the "Copied" state. This
  means **Task 2.3's step 1 ("first add a globe icon") is already done**; 2.3
  should just render the marker. `icon-paths.ts` wasn't in this task's declared
  Files but the row pattern made it unavoidable.
- **Parent-freshness wiring:** added an optional `onpublicchange?: (value:
  boolean) => void` prop. `ItemsScreen` passes it to update its own `listMeta`
  (since `setPublic`'s `lists.items` write doesn't touch `listMeta`);
  `ListsScreen` omits it (it passes the same `lists.items` element, mutated in
  place). Used `setPublic`'s `onpublicchange` callback rather than re-running
  `reloadMeta()` — a local in-place update is cheaper and avoids a round-trip.
- The manual state mock (`state/__mocks__/lists.svelte.ts`) gained a `setPublic`
  export so the sheet test's mocked import resolves.

### [x] 2.3 Render the public marker in member views

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T21:12:28Z

**Why:** Members must instantly see that a list is public (R7), in both the
list collection and the list-detail header.

**Prerequisites:** Task 2.1 (`is_public` in the type/queries).

**Decisions:**
- First add a `globe` icon to `ICON_PATHS`
  (`web/src/lib/basic/model/icon-paths.ts`) — there is **no** globe (nor any
  share/link icon) today, and `IconName` is a union of the existing keys, so
  `name="globe"` would not type-check without it. A group/person icon would read
  too close to the existing members `users` icon; the globe reads as
  "public/world". Lucide `globe`, single-`d` form matching the file's
  circle→arc convention:
  ```
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20',
  ```
- Render the globe icon after the list name, gated on `is_public`, in:
  the collection row in `web/src/lib/list/components/ListsScreen.svelte`, and
  the TopBar title in `web/src/lib/item/components/ItemsScreen.svelte`.
- Use the shared `Icon.svelte`; **do not** pass a colour prop — wrap it and set
  colour via CSS (e.g. `var(--muted)`). Add an accessible label "Public list"
  (visually-hidden text or `aria-label` per the existing icon-labelling pattern;
  see the `sr-only` usage in `AvatarSourceSheet.svelte`).
- Not rendered on the `/p/` page (Phase 3).

**Reference:** project memory on `Icon.svelte` (no colour prop); `docs/ui.md`
TopBar conventions.

**Files:**
- `web/src/lib/basic/model/icon-paths.ts` (modify — add `globe`)
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**
1. RED — In both component tests: a public list renders the marker with its
   accessible label; a private list does not.
2. GREEN — Add the gated icon + wrapper + CSS in both components.
3. GREEN — `pnpm test` and `pnpm check` green.

**Verify:** `cd web && pnpm test` · `pnpm check` · `pnpm lint`

**Notes:**
- **`globe` icon already existed** — it was added in Task 2.2 (the overflow
  publish toggle is its first consumer), so this task's step 1 was a no-op.
- **User correction — Items-screen placement.** The plan/`docs/ui.md` put the
  globe immediately after the list name in the Items-screen TopBar *title*. Mid-
  task the user asked for it in the **sub line** instead: `4 items · 1 member ·
  🌐 Public` (separator dot + globe + visible "Public" label). The Lists-screen
  row keeps the globe after the name (user confirmed they prefer that). Updated
  `docs/ui.md` to record the per-screen split.
- **Side work — `TopBar` gained a `subAfter?: Snippet` prop.** The `sub` prop is
  a plain string and can't hold an icon, so the sub-line marker needed a snippet
  rendered inline after the sub text. Optional; only `ItemsScreen` uses it.
- **Doc divergence fixed:** `docs/ui.md` specified the marker colour as
  `var(--muted)`, but there is **no `--muted` token**. The muted-grey in use is
  `--stone` (the row overflow button, meta text). Used `--stone` and corrected
  the doc. The Items-screen marker inherits the `.caption` colour from the sub
  line rather than setting it explicitly.

## Phase 3 — anonymous read-only view

### [x] 3.1 Build the `/p/<list_id>` read-only page

**Created:** 2026-06-11T20:06:58Z
**Completed:** 2026-06-11T21:33:06Z

**Why:** The whole point — anyone with the link sees a read-only list while
signed-out (R3, R6).

**Prerequisites:** Task 1.1 (`public_list_view` RPC). Toolchain note: this task
*creates* the `/p/[list_id]` route; nothing navigates to it via `resolve()`
beforehand, and the copy-link in Task 2.2 builds the URL as a plain string
(`<origin>/p/<id>`), so there is no not-yet-created-route type error to manage.

**Decisions:**
- Route `web/src/routes/p/[list_id]/+page.svelte`, placed **outside** the
  `(app)` group so it does not inherit the signed-in shell.
- Allowlist: add `'/p'` to `PUBLIC_CONTENT_PATHS` in
  `web/src/lib/shared/model/public-paths.ts` so the signed-out guard in
  `web/src/routes/+layout.svelte` does not redirect to `/auth/login`. Do **not**
  touch `auth-paths.ts` (mirrored into the auth-proxy, drift-guarded).
- Fetch via `pgPost('/rpc/public_list_view', { p_id: listId })` from
  `web/src/lib/shared/http/postgrest.ts`. Cookieless → `anon`; signed-in →
  `authenticated`; both granted. A `null` result renders a single generic
  "list not available" state (do not distinguish private vs missing).
- Render read-only: name, description, and items (name, notes, ranked order,
  **including the score badge** as on `ItemsScreen` — the payload carries
  `score` and items are ordered by it). **No** vote controls, add-item FAB,
  overflow menu, member avatars, or attribution, and **no** public marker icon.
  Reuse item-row presentation in a read-only mode where practical.
- **Page chrome (no design-canvas mockup exists for this new screen — spec it
  here):** a signed-out stranger has no back target, so the TopBar shows **no**
  back button. Show a small Cairn wordmark/glyph as a non-interactive header
  (reuse `CairnWordmark`/`CairnGlyph`) so the page is recognisably Cairn; no
  settings/refresh actions. No sign-up CTA in this iteration (keep it a clean
  read-only view). Colour/type come from tokens and global rules (e.g. list
  name → global `h1`/title style, section rule → `var(--rule)`), never literals.
  The "list not available" branch reuses the `EmptyState` pattern from
  `docs/ui.md`.
- Route-colocated test drops the `+`: `page.test.ts`.

**Reference:** `.claude/skills/writing-tasks.md` (route test filename rule);
`docs/ui.md` (empty/unavailable-state pattern).

**Files:**
- `web/src/routes/p/[list_id]/+page.svelte` (create)
- `web/src/routes/p/[list_id]/page.test.ts` (create)
- `web/src/lib/shared/model/public-paths.ts` (modify)

**Steps:**
1. RED — Create `page.test.ts`: mounting with a mocked RPC object renders the
   name and ranked items and exposes no edit affordances; a `null` RPC result
   renders the "list not available" state.
2. RED — `cd web && pnpm test`; confirm red (page absent).
3. GREEN — Add `'/p'` to `PUBLIC_CONTENT_PATHS`; build the page (fetch + both
   render branches) read-only.
4. GREEN — `pnpm test`, `pnpm check`, `pnpm lint` green. Manually confirm in a
   logged-out (incognito) browser that `/p/<public-id>` renders and
   `/p/<private-id>` shows "not available".

**Verify:** `cd web && pnpm test` · `pnpm check` · `pnpm lint`

**Notes:**
- **User correction — masthead is a home link, not inert.** The plan specced a
  *non-interactive* wordmark with no CTA. Mid-task the user asked for the Cairn
  logo to **link to the home page** as an invitation to join (a signed-out
  visitor following it lands on sign-in/join). Implemented as an `<a href="/">`
  wrapping the wordmark (`data-test="public-home-link"`). The read-only
  guarantee holds — a link is not an edit control (the test still asserts zero
  `<button>`s).
- **Lint:** `svelte/no-navigation-without-resolve` requires `resolve()` for
  internal hrefs, so the home link uses `resolve('/')` (identity when there's no
  base path).
- **User request mid-task — item ages (expanded scope, DB change).** The user
  asked to show each item's creation date, rendered with `timeAgo`. The curated
  anon payload didn't carry it, so this added **migration
  `0016_public_list_item_created_at.sql`** (`CREATE OR REPLACE public_list_view`
  to include each item's `created_at` — grants preserved), a new pgTAP assertion
  (`public_lists.sql` `plan(16)`→`plan(17)`: items carry `created_at`), and a
  `docs/data-model.md` payload update. A date is *when*, not *who*, so it does
  not reopen the no-attribution boundary. Verified with `./scripts/test-db.sh`
  (PASS) and `sqlfluff` (clean) in addition to the web verifier.
- **Did not** do the manual incognito check (plan step 4) — that live-browser
  pass belongs to the Playwright touch in Task 3.2.

### [ ] 3.2 Playwright touch for the public flow

**Created:** 2026-06-11T20:06:58Z
**Completed:**

**Why:** A user-visible flow gets an e2e touch per `docs/testing.md`.

**Prerequisites:** Tasks 2.2, 3.1.

**Decisions:**
- Spec: a member publishes a list and copies the link; a signed-out context
  opens `/p/<id>` and sees the read-only list with no edit controls; a private
  list's id at `/p/` shows "not available".
- Playwright is **machine-conditional** (project memory): on the laptop
  it cannot run — write the spec, report unrunnable, never fake a pass. On the
  work box the **chromium + firefox** projects run; **webkit** does not, so skip
  it there.

**Files:**
- `web/e2e/public-list.spec.ts` (create)

**Steps:**
1. Write the spec covering publish → copy link → signed-out read-only view →
   private-id unavailable.
2. Attempt `cd web && pnpm test:e2e`. On the laptop it won't run — report that
   explicitly in the task `Notes` and leave the spec for CI. On the work box,
   run the chromium + firefox projects (e.g. `--project=chromium
   --project=firefox`), skip webkit, and report the real result — don't claim a
   pass that didn't run.

**Verify:** `cd web && pnpm test:e2e` (chromium + firefox where supported;
unrunnable on the laptop — report, don't fake) · `./scripts/check.sh`
