# Tasks

## Reference skills and docs

- **`docs/data-model.md`** — `items_ranked` view shape, `votes` table schema, RLS policies for items and votes.
- **`docs/ui.md`** — vote control spec, accordion behaviour, undo snackbar, button-pair order, empty states, fixed-element safe-area pattern.
- **`design/cairn-screens.jsx`** — `ItemsScreen`, `ItemRow`, `ItemPanel`, `AddItemScreen`, `EditItemScreen`, `DeleteItemScreen`, `ItemsScreenWithUndo` for pixel-level reference.
- **`design/cairn-ui.jsx`** — `VoteControl`, `VoteIndicator` functions for vote widget design.
- **`docs/quality.md`** — "Navigating to a not-yet-created SvelteKit route" for the route-stub escape pattern.
- **`docs/frontend-layout.md`** — lib tier split (`basic/`, `shared/`, per-domain), mock placement, route test filename rules (no `+` prefix).
- **`docs/testing.md`** — Vitest + MSW patterns, Playwright conventions.

---

## Phase 0 — Doc reconciliation + DB migration

### [x] 0.0 Update docs/data-model.md — restoreItem payload

**Created:** 2026-05-24T00:00:00Z
**Completed:** 2026-05-24T07:28:24Z

**Why:** `docs/data-model.md` `items_deleted` paragraph (the `PATCH /items` restore sentence) shows
`{"deleted_at": null, "deleted_by": null}`. But `tg_set_attribution_items`'s restore branch
(`old.deleted_at is not null and new.deleted_at is null`) clears `deleted_by` back to null
automatically — the client does not need to send it. Leaving the redundant field in the doc
misleads future plan authors into believing the client must supply it. (The "What the app sees"
section already reads `deleted_at: null` without `deleted_by: null` — no change needed there.)

**Prerequisites:** None — doc-only.

**Files:**
- `docs/data-model.md` (modify)

**Steps:**
1. In `docs/data-model.md`, in the `items_deleted` paragraph, find the restore sentence:
   "Restoring an item is a `PATCH /items?id=eq.<uuid>` with `{"deleted_at": null, "deleted_by": null}`"
   and update it:
   - Change `{"deleted_at": null, "deleted_by": null}` to `{"deleted_at": null}`
   - Add a parenthetical after the payload: "(the trigger's restore branch clears `deleted_by` automatically)"

**Verify:** `git diff docs/data-model.md`

### [ ] 0.1 Add items→profiles FK constraints

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** PostgREST embedded resource joins require an explicit FK constraint between the joined tables. `fetchItems` (Task 1.1) queries `items_ranked` with `?select=*,created_by_profile:profiles!created_by(display_name),modified_by_profile:profiles!modified_by(display_name)` — requiring `items.created_by → public.profiles(id)` and `items.modified_by → public.profiles(id)`. The votes query uses `&select=item_id,user_id,value,profile:profiles!user_id(display_name)` — requiring `votes.user_id → public.profiles(id)`. None of these FKs exist yet (all three columns reference `auth.users(id)` only). The equivalent gap for `list_members.user_id` was closed in migration 0005 for the same reason.

**Prerequisites:** None — pure DB migration.

**Decisions:**
- Add two FK constraints on `items` using `ON DELETE SET DEFAULT` (matching the existing items FKs to `auth.users`). When a profile is hard-deleted (only via cascade from `auth.users`), the `auth.users` FK's `SET DEFAULT` fires, setting `created_by`/`modified_by` to the tombstone UUID before the profiles row disappears; the new FK's own `SET DEFAULT` is a no-op idempotent fallback.
- Add one FK constraint on `votes` using `ON DELETE CASCADE` (matching the existing `votes.user_id → auth.users ON DELETE CASCADE`). When a profile is cascade-deleted with its `auth.users` row, the votes are already cascade-deleted by the `auth.users` FK, so this FK is idempotent but required for PostgREST to resolve the profile embed.
- The tombstone profile row (`id = '00000000-0000-0000-0000-000000000000'`, `display_name = 'Deleted user'`) was inserted in migration 0004, so all existing items rows satisfy the new FKs immediately. Votes rows reference real users so also satisfy them.
- Migration name: `0006_items_profiles_fk.sql`.
- pgTAP test: assert all three FK constraints exist using `fk_ok` (the project pattern — see `db/tests/list_metadata.sql:53`).

**Files:**
- `db/migrations/0006_items_profiles_fk.sql` (create)
- `db/tests/0006_items_profiles_fk.sql` (create — pgTAP)

**Steps:**
1. RED — Create `db/tests/0006_items_profiles_fk.sql` with pgTAP assertions using `fk_ok`
   (the project pattern — see `db/tests/list_metadata.sql:53`):
   - `fk_ok('public', 'items', 'created_by', 'public', 'profiles', 'id', 'items.created_by FK to profiles');`
   - `fk_ok('public', 'items', 'modified_by', 'public', 'profiles', 'id', 'items.modified_by FK to profiles');`
   - `fk_ok('public', 'votes', 'user_id', 'public', 'profiles', 'id', 'votes.user_id FK to profiles');`
   - A positive: inserting an item row with a `created_by` UUID that exists in `profiles` succeeds.
   - A negative: inserting an item row with a `created_by` UUID that does not exist in `profiles`
     (but does exist in `auth.users`) raises a FK violation — confirms the constraint actually rejects
     bad data, not just that it structurally exists. Fixture setup: insert a fresh user into
     `auth.users` (the `tg_profile_on_signup` trigger will auto-create their `profiles` row), then
     immediately `DELETE FROM public.profiles WHERE id = <that-uuid>`, leaving the `auth.users` row
     intact. Set `request.jwt.claims` to that UUID. **Run the INSERT at the `cairn` role** (the table
     owner — it bypasses RLS, so no list-membership row for this UUID is needed): `INSERT INTO
     public.items (list_id, name) VALUES (...)`. The attribution trigger stamps `created_by = uid()`
     (the profileless UUID) via the JWT claims — this passes the `auth.users` FK but fails the new
     `profiles` FK. Running as `authenticated` instead would fail on `items_insert`'s
     `is_list_member()` check before reaching the FK, making the test vacuous. This matches the
     pattern in `db/tests/rls_items.sql` where fixture inserts are always run at the `cairn` role.
2. RED — Run `./scripts/test-db.sh` and confirm the new file reports failures (FKs don't exist yet).
3. GREEN — Create `db/migrations/0006_items_profiles_fk.sql`:
   ```sql
   -- 0006_items_profiles_fk.sql — FK constraints enabling PostgREST profile joins
   --   from items.created_by, items.modified_by, and votes.user_id to public.profiles.
   --   Mirrors the list_members → profiles FK added in 0005.
   ALTER TABLE public.items
     ADD CONSTRAINT items_created_by_profiles_fk
       FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE SET DEFAULT,
     ADD CONSTRAINT items_modified_by_profiles_fk
       FOREIGN KEY (modified_by) REFERENCES public.profiles (id) ON DELETE SET DEFAULT;

   ALTER TABLE public.votes
     ADD CONSTRAINT votes_user_id_profiles_fk
       FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
   ```
4. GREEN — Run `./scripts/test-db.sh` with the migration applied; all tests pass.
5. Run `./scripts/check.sh`.

**Verify:** `./scripts/test-db.sh`

---

## Phase 1 — Route stub + model layer

### [ ] 1.1 Create route stub and item model

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** The `[list_id]` route must exist before `svelte-check` accepts `resolve('/lists/' + id)` in `ListsScreen.svelte`. Creating the stub unblocks the type checker for everything that follows. The item model defines the wire types and API functions that the store (Task 2.1) and components (Phase 4) depend on.

**Prerequisites:** None — this is the first task on the `0404_items_screen` branch.

**Decisions:**
- Route stub is a minimal `+page.svelte` that imports `ItemsScreen` (not yet created); to avoid a toolchain catch-22, import it with `// @ts-expect-error — component added in Task 4.1` so `pnpm check` passes before the component exists. Alternatively, create a placeholder `ItemsScreen.svelte` stub alongside. **Prefer the stub approach**: create a bare-bones `ItemsScreen.svelte` in Phase 1 (renders a `<div data-test="items-screen-stub"></div>`) to give `svelte-check` a valid import target; the real component replaces it in Task 4.1.
- Once the route exists, remove the `// eslint-disable-next-line svelte/no-navigation-without-resolve` comment in `ListsScreen.svelte` (line 88–89) and replace the bare string `goto('/lists/' + item.id)` with `goto(resolve('/lists/' + item.id))`.
- `Item` type fields: `id`, `list_id`, `name`, `notes: string | null`, `created_by`, `modified_by`, `created_by_name`, `modified_by_name: string | null`, `score`, `created_at`, `modified_at`, `my_vote: number | null`, `member_votes: { user_id: string; display_name: string; value: number }[]`.
- Separate wire types `ItemRanked` (from `items_ranked` view) and `VoteRow` (from `votes` join) are merged in `fetchItems` into `Item[]`. Items_ranked is fetched with `?select=*,created_by_profile:profiles!created_by(display_name),modified_by_profile:profiles!modified_by(display_name)`. Votes are fetched with `?item_id=in.(<ids>)&select=item_id,user_id,value,profile:profiles!user_id(display_name)` — PostgREST embedded resource join via FK alias. The merge uses `session.uid` to identify `my_vote`. For `modified_by_name`: set it to `null` when `modified_at <= created_at` (the item has never been edited — the DB trigger sets `modified_by = created_by` on insert but doesn't advance `modified_at` past `created_at`); otherwise set it to `modified_by_profile.display_name`.
- `ItemRanked` wire type must type `created_by_profile` and `modified_by_profile` as `{ display_name: string } | null`. PostgREST resolves embedded joins from views by introspecting the underlying table's FK (supported in PostgREST v11+). If the embed is absent (server on an older build or schema-cache miss), the profile field will be `null` — use `created_by_profile?.display_name ?? 'Unknown'` and `modified_by_profile?.display_name ?? null` in the merge so a missing embed is a graceful degradation rather than a runtime crash.
- API functions: `fetchItems(listId, uid)`, `addItem(listId, name, notes?)`, `editItem(itemId, name, notes)`, `softDeleteItem(itemId)`, `restoreItem(itemId)`, `upsertVote(itemId, value)`, `deleteVote(itemId)` — all thin wrappers around `pgGet/pgPost/pgPatch/pgDelete` from `$lib/shared/http/postgrest`.
- `deleteVote(itemId)` calls `DELETE /votes?item_id=eq.<itemId>` with no `user_id` query parameter. The `votes_delete` RLS policy (`using (user_id = public.uid())`) scopes the delete to the authenticated user's own vote automatically, making the `user_id` filter redundant in the query string.
- `restoreItem(itemId)` sends `PATCH /items?id=eq.<uuid>` with `{deleted_at: null}` only. The `tg_set_attribution_items` trigger's restore branch (`old.deleted_at is not null and new.deleted_at is null`) clears `deleted_by` back to null automatically — the client does not need to send `deleted_by: null` even though `docs/data-model.md` "What the app sees" shows it in the example. The trigger makes it redundant.
- Add MSW handlers in `handlers.ts`: `GET */api/items_ranked` returns `[]`, `GET */api/votes` returns `[]`, `POST */api/items` returns a stub item, `PATCH */api/items` returns 204, `POST */api/votes` returns 200, `DELETE */api/votes` returns 204.

**Reference:** `docs/quality.md` "Navigating to a not-yet-created SvelteKit route" for the stub pattern. `docs/frontend-layout.md` for lib structure and mock placement. Route test file must be named `page.test.ts` (no `+` prefix).

**Files:**
- `web/src/routes/(app)/lists/[list_id]/+page.svelte` (create — stub)
- `web/src/routes/(app)/lists/[list_id]/page.test.ts` (create)
- `web/src/lib/item/components/ItemsScreen.svelte` (create — placeholder stub)
- `web/src/lib/item/components/__mocks__/ItemsScreen.svelte` (create)
- `web/src/lib/item/model/item.ts` (create)
- `web/src/lib/item/model/item.test.ts` (create)
- `web/src/lib/test/handlers.ts` (modify — add item/vote handlers)
- `web/src/lib/list/components/ListsScreen.svelte` (modify — replace eslint-disable goto with resolve())

**Steps:**
1. Create `web/src/lib/item/components/ItemsScreen.svelte` placeholder:
   ```svelte
   <div data-test="items-screen-stub"></div>
   ```
2. Create `web/src/lib/item/components/__mocks__/ItemsScreen.svelte` (same one-liner stub pattern as other mocks in `__mocks__/`).
3. Create `web/src/routes/(app)/lists/[list_id]/+page.svelte`:
   ```svelte
   <script lang="ts">
     import { page } from '$app/state';
     import ItemsScreen from '$lib/item/components/ItemsScreen.svelte';
   </script>
   <ItemsScreen listId={page.params.list_id} />
   ```
4. RED — Create `web/src/routes/(app)/lists/[list_id]/page.test.ts`: render the page, assert `data-test="items-screen-stub"` is in the DOM (verifies route exists and imports component).
5. In `web/src/lib/list/components/ListsScreen.svelte`: remove the `// eslint-disable-next-line` comment and update `goto('/lists/' + item.id)` to `goto(resolve('/lists/' + item.id))`. `resolve` is already imported at the top of the file.
6. Create `web/src/lib/item/model/item.ts` with `Item`, `ItemRanked`, `VoteRow` types and function stubs (signatures that `throw new Error('not implemented')`).
7. RED — Create `web/src/lib/item/model/item.test.ts` with tests: (a) `fetchItems` calls `GET /items_ranked` and `GET /votes`, merges and returns `Item[]`; (b) `addItem` posts to `/items` and returns the new row; (c) `softDeleteItem` sends `PATCH /items?id=eq.<uuid>` with `{deleted_at: <timestamp>}` — no `deleted_by` field (the trigger sets it automatically, same reasoning as `restoreItem`); (d) `upsertVote` posts to `/votes` with `Prefer: resolution=merge-duplicates`; (e) `deleteVote` deletes from `/votes`; (f) `restoreItem` sends `PATCH /items?id=eq.<uuid>` with `{deleted_at: null}`; (g) when the MSW handler returns an `ItemRanked` row whose `modified_at === created_at`, the merged `Item.modified_by_name` is `null` (item never edited).
8. Add MSW handlers to `web/src/lib/test/handlers.ts` per Decisions. **Do not** change or add to the existing `GET */api/lists` default handler (it already returns `[]` for ListsScreen tests; adding a second handler would shadow it or be silently ignored). Instead, `ItemsScreen.test.ts` (Task 3.1) will use `server.use(http.get('*/api/lists', () => HttpResponse.json([stubList])))` in its `beforeEach` to provide the list-name stub for that test file only.
9. GREEN — Implement `item.ts` model functions to make tests pass.
10. Run `pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 1.2 Items state store

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** The store is the single source of truth for a list's items. Components read from it and call its mutation functions. Having the store tested in isolation (before any UI) makes the optimistic-update and undo-timer logic verifiable without rendering.

**Prerequisites:** Task 1.1 — `item.ts` model functions exist; MSW handlers return predictable data.

**Decisions:**
- Store shape (Svelte 5 `$state`):
  ```typescript
  export const items = $state<{
    rows: Item[];
    loading: boolean;
    error: string | null;
    listId: string | null;
    pendingDelete: { item: Item; timerId: ReturnType<typeof setTimeout> } | null;
  }>({ rows: [], loading: false, error: null, listId: null, pendingDelete: null });
  ```
- `loadItems(listId: string)`: sets `loading = true`, reads `uid` from `session.current` (import `session` from `$lib/shared/state/session.svelte`, same as `lists.svelte.ts`), calls `fetchItems(listId, uid)`, updates `rows` and `listId`, sets `loading = false`.
- `upsertVote(itemId, value)`: finds the item in `rows`, stores old `{ my_vote, score }`, optimistically sets new values, calls API, rolls back on error.
- `deleteVote(itemId)`: same optimistic pattern, API call is `deleteVote(itemId)`.
- `softDeleteItem(itemId)`: saves the item and its original index from `rows`, removes it from `rows`, sets `pendingDelete` with a 6000 ms `setTimeout` that clears `pendingDelete` on fire. Calls `softDeleteItem(itemId)` on the API immediately. On API error, rolls back: re-inserts the item at the saved index, clears `pendingDelete`.
- `undoDelete()`: **pessimistic** — cancels the timer, calls `restoreItem` API, and only on success re-inserts the item at its correct sorted position (by score desc, created_at asc) and clears `pendingDelete`. On API error, `pendingDelete` stays set (so the snackbar remains visible for a retry tap), `rows` is unchanged, and the store sets `error` with a message. Because the original timer was canceled, a new 4-second auto-dismiss timer is set so the snackbar does not stay visible forever if the user does not retry; **when this fallback timer fires it clears both `pendingDelete` and `items.error`** (not just `pendingDelete`) so stale error state does not persist into subsequent operations. This avoids the state split where the item appears restored in the UI but is still soft-deleted server-side.
- `addItem(listId, name, notes?)`: calls API, then calls `loadItems(listId)` to refresh (simple approach; full optimistic insert is future work).
- `editItem(itemId, name, notes)`: calls API, then refreshes via `loadItems`.
- The mock `__mocks__/items.svelte.ts` exports `items` as a plain reactive object with all the same fields (preset empty) and stub functions that do nothing; tests that render components which use the store can override with `vi.mocked`.

**Files:**
- `web/src/lib/item/state/items.svelte.ts` (create)
- `web/src/lib/item/state/items.test.ts` (create)
- `web/src/lib/item/state/__mocks__/items.svelte.ts` (create)
- `web/src/lib/shared/state/session.svelte` (import only — no edits)

**Steps:**
1. RED — Write `items.test.ts`. Mock `$lib/shared/state/session.svelte` (same pattern as `lists.test.ts`):
   ```typescript
   vi.mock('$lib/shared/state/session.svelte');
   ```
   In `beforeAll` (or at the top of the describe block) call `sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' })` so `loadItems` receives a real uid. Add a `beforeEach` that resets the `items` singleton back to its initial shape before every test — `items` is module-level `$state` and persists between test runs in the same Vitest worker:
   ```typescript
   beforeEach(() => {
     Object.assign(items, { rows: [], loading: false, error: null, listId: null, pendingDelete: null });
   });
   ```
   Then write tests: (a) `loadItems` populates `rows`; (b) `upsertVote` mutates `my_vote` and
   `score` optimistically; (c) `upsertVote` optimistic update rolls back on API 500; (d)
   `softDeleteItem` removes item from `rows` and sets `pendingDelete`; (e) `softDeleteItem`
   re-inserts item at original index and clears `pendingDelete` on API 500; (f) `undoDelete`
   re-inserts item and clears `pendingDelete` when `restoreItem` succeeds; (g) `undoDelete` on
   API 500: `rows` unchanged, `pendingDelete` set, `error` set, and a new 4-second auto-dismiss
   timer fires — when it fires both `pendingDelete` **and** `error` are null (assert both fields
   after advancing fake timers by 4 s); (h)
   `addItem` then `loadItems` populates rows; (i) `editItem` calls API with updated name/notes then
   refreshes `rows` via `loadItems`; on API 500, `rows` are unchanged; (j) `addItem` on API 500
   sets `items.error` and does not call `loadItems` (rows remain empty).
2. GREEN — Implement `items.svelte.ts` to make tests pass.
3. Create `__mocks__/items.svelte.ts` stub.
4. Run `pnpm test`.

**Verify:** `pnpm test`

---

## Phase 2 — VoteControl component

### [ ] 2.1 VoteControl component

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** `VoteControl` is the most interactive primitive on the items screen. Isolating and testing it first means the component is reliable before it's embedded in dozens of rows.

**Prerequisites:** Task 1.1 — `Icon.svelte` (`thumbs-up`, `thumbs-down` icons) exists in `$lib/basic/components/Icon.svelte`.

**Decisions:**
- Props: `value: number | null` (null = no vote = render `=`), `onchange: (v: number | null) => void`, `disabled?: boolean`.
- Thumb logic for thumbs-up: `null` → `onchange(1)`; +3 → disabled (opacity 0.35, no event); −1 → `onchange(null)` (vote removal — opposite-direction tap takes −1 to 0, which is invalid, so emit null for store to DELETE); otherwise → `onchange(value + 1)`. For thumbs-down: mirror exactly — `null` → `onchange(-1)`; −3 → disabled; +1 → `onchange(null)` (vote removal); otherwise → `onchange(value - 1)`. The null-emission formula: `Math.abs(value) === 1 && direction === -Math.sign(value)` (opposite-direction tap at ±1).
- The indicator slot is always 44 px wide (`min-width: 44px; text-align: center`), JetBrains Mono 16 px, **font-weight 600** (per `docs/ui.md` "Vote indicator typography" — weight is constant across all seven states). **letter-spacing**: `0` when value is `null` or `0`; `'-0.04em'` otherwise (per `design/cairn-ui.jsx` `VoteIndicator:175` — tightens multi-char symbols like `---` and `+++`). Mapping: `null|0 → '='`, `1 → '+'`, `2 → '++'`, `3 → '+++'`, `-1 → '-'`, `-2 → '--'`, `-3 → '---'`. Color: `var(--sage)` for positive, `var(--ember)` for negative, `var(--stone)` for neutral.
- Buttons: 36×36 px, transparent background, `var(--ink-soft)` color, `border-radius: 10px`. Stop propagation on click (`onclick` prevents the row toggle from firing).
- `data-test` attributes: `vote-down`, `vote-indicator`, `vote-up` for test selectors.

**Reference:** `design/cairn-ui.jsx` `VoteControl` and `VoteIndicator` functions for exact visual spec. `docs/ui.md` § "The vote control".

**Files:**
- `web/src/lib/item/components/VoteControl.svelte` (create)
- `web/src/lib/item/components/VoteControl.test.ts` (create)
- `web/src/lib/item/components/__mocks__/VoteControl.svelte` (create)

**Steps:**
1. RED — Write `VoteControl.test.ts`: (a) renders `=` when `value` is null; (b) renders `+` when value is 1; (c) renders `---` when value is −3; (d) tapping up calls `onchange(1)` when value is null; (e) tapping up when value is +1 calls `onchange(2)` (ordinary nudge); (f) tapping DOWN when value is +1 calls `onchange(null)` (vote removal — opposite-direction tap at +1); (g) tapping up when value is +3 button is disabled; (h) tapping UP when value is −1 calls `onchange(null)` (vote removal — opposite-direction tap at −1); (i) clicking a thumb stops event propagation (no parent toggle fired).
2. GREEN — Implement `VoteControl.svelte`.
3. Create `__mocks__/VoteControl.svelte` (stub renders three spans with test ids).
4. Run `pnpm lint && pnpm check && pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 3 — ItemsScreen

### [ ] 3.1 ItemsScreen with rows, accordion, and empty state

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** This replaces the placeholder `ItemsScreen.svelte` stub with the real component. It renders the TopBar, item rows with the one-at-a-time accordion (ItemPanel), the empty state, and the FAB. Sheets and snackbar come in Task 3.2.

**Prerequisites:** Tasks 1.2 and 2.1 — `items` store and `VoteControl` exist.

**Decisions:**
- `ItemsScreen` accepts a `listId: string` prop (passed from `+page.svelte`, which reads `$page.params.list_id`). The component calls `loadItems(listId)` on mount via `$effect`. This keeps `ItemsScreen` testable by passing the ID directly in tests, with no need to mock `$app/state`.
- Also needs the list name and member count for the TopBar sub-text. Options: (a) fetch from `GET /lists?id=eq.<uuid>` in the store or component; (b) pass list metadata from the ListsScreen route state. **Option (a)**: fetch a minimal list row (`?id=eq.<uuid>&select=name,list_members(user_id)&list_members.deleted_at=is.null`) inside `ItemsScreen` on mount via a local `$state({ name: '', memberCount: 0 })` reactive variable and a `pgGet` call alongside `loadItems` — keeps routing simple and the items screen self-contained. Member count is `listMeta.list_members.length` (the array length of the embedded `list_members` rows, filtered to active members by the `deleted_at=is.null` modifier). **Do not** use `list_members(count)` — `count` is not a column on `list_members`; that syntax fails at runtime. The MSW handler for the `GET /lists` endpoint is added in Task 1.1 step 8; in `ItemsScreen.test.ts` the stub returns `[{ id: 'test-list-id', name: 'Test list', list_members: [{ user_id: '...' }] }]`.
- **TopBar sub-text canonical format**: `"{itemCount} items · {memberCount} member"` (singular) or `"{itemCount} items · {memberCount} members"` (plural). Items come first, members second. (The two JSX mocks — `ItemsScreen` and `ItemsScreenWithUndo` — disagree on order; use `ItemsScreen`'s "items · members" ordering as canonical.)
- `openId: string | null = $state(null)` — single reactive variable for the accordion. When `openId` is set to a non-null value (panel opens), call `pushHistoryGuard(() => { openId = null; })` from `$lib/shared/state/back-stack.svelte` so system-back closes the panel before navigating away (per `docs/ui.md` § "Navigation and back": "the unfolded accordion panel pushes a state on open"). The `$effect` cleanup return from `pushHistoryGuard` handles teardown when the component unmounts or `openId` resets to null.
- Each item row: `<div class="row">` with `<button class="row-tap">` (name + optional score badge) and `<VoteControl>`. Tapping `row-tap` sets `openId`. VoteControl `onchange` calls `upsertVote` or `deleteVote` on the store.
- Score badge: shown only when `item.score !== 0`. Render `{score > 0 ? '+' : ''}{score}` — positive scores get a `+` prefix (e.g. `+3`), negative values use their natural minus sign (e.g. `-2`) (per `design/cairn-screens.jsx` `ItemRow` line 572). Style: small mono chip; for positive: text `var(--sage)`, background `var(--sage-bg)`; for negative: text `var(--ember)`, background `var(--ember-bg)`. (Per design JSX line 567–568 — `sageBg`/`emberBg` are the light-tinted backgrounds, not the full-saturation colors.) **font-size: 11px, font-weight: 600**. Badge sits to the right of the name, before the VoteControl.
- ItemPanel (rendered when `isOpen`): notes (Newsreader italic), member votes (Avatar + name + value), attribution, [Delete | Edit] buttons. Delete opens `DeleteItemSheet`, Edit opens `AddEditItemSheet` in edit mode.
- `AddEditItemSheet` props: `mode: 'add' | 'edit'`, `listName: string` (for the TopBar `sub="in {listName}"`), `item?: Item` (populated in edit mode), `onsubmit: () => void`, `oncancel: () => void`. `listName` comes from `listMeta.name`.
- **Mocking `AddEditItemSheet` and `DeleteItemSheet` in `ItemsScreen.test.ts`**: each is consumed only by `ItemsScreen.test.ts`, so use inline `vi.mock(path, factory)` rather than creating `__mocks__/` files — one-off mocks per `docs/frontend-layout.md`.
- `DeleteItemSheet` props: `item: Item`, `memberCount: number`, `ondelete: () => void`, `oncancel: () => void`. The `memberCount` value comes from `listMeta.list_members.length` (the count of active members fetched alongside the list name). The sheet body reads **"Other members will no longer see this item. You can restore it from this list's trash."** when `memberCount > 1`, or **"No other members can see this item. You can restore it from this list's trash."** when `memberCount === 1` (solo list). ("Bob and Carol" in the design JSX is placeholder copy, not literal text.)
- Empty state: exactly as per design spec (feather icon, "Nothing here yet", "Drop the first stone…", "Add the first item" button that opens the add sheet).
- FAB: opens `AddEditItemSheet` in add mode. Hidden when `items.pendingDelete` is non-null (snackbar is showing).
- Back arrow: render `<TopBar showBack={true} ...>` — TopBar's built-in `history.back()` handler is the back affordance; do not call `goto(resolve('/lists'))` (per `docs/ui.md`: back must never be a hard-coded destination).
- The `⋮` (more-vertical) button: renders but `onclick` is a no-op for now (list management is out of scope; `aria-label="More options"`).
- Design reference for exact pixel values:
  - Row outer wrapper: `background: var(--paper-alt)` when open, `transparent` when closed (design JSX `ItemRow` line 549 — the whole row block, not just the panel, gets the tinted background when expanded)
  - Row: `padding: 14px 18px 14px 20px; min-height: 56px`
  - Name: `font-size: 15.5px; font-weight: 500` (600 when open)
  - ItemPanel: `padding: 4px 22px 18px; border-top: 1px dashed var(--rule); background: var(--paper-alt)`
  - Notes: Newsreader italic 14px inkSoft
  - Member vote entry: Avatar size 18, font-size 12.5px inkSoft, vote in JetBrains Mono
  - Attribution: font-size 11.5px stone
  - Action buttons: `flex: 1; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 10px; font-size: 13px`

**Reference:** `design/cairn-screens.jsx` `ItemsScreen`, `ItemRow`, `ItemPanel`, `EmptyListScreen` functions. `docs/ui.md` § "Items screen" and § "Empty states".

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (modify — replace stub with full implementation)
- `web/src/lib/item/components/ItemsScreen.test.ts` (create)
- `web/src/lib/item/components/AddEditItemSheet.svelte` (create)
- `web/src/lib/item/components/AddEditItemSheet.test.ts` (create)
- `web/src/lib/item/components/DeleteItemSheet.svelte` (create)
- `web/src/lib/item/components/DeleteItemSheet.test.ts` (create)

**Steps:**
1. RED — Write `ItemsScreen.test.ts`: (a) shows loading state initially; (b) shows empty state when `rows` is empty; (c) renders item rows with names and vote controls; (d) tapping a row opens its panel (one at a time — opening a second closes the first); (e) tapping the back button calls `history.back()` (assert via `vi.spyOn(window.history, 'back')`); (f) FAB is visible when no pending delete; (g) TopBar title text matches the list name returned by the `GET /lists` stub handler (i.e. "Test list"); (h) with a panel open, dispatching a `popstate` event on `window` closes the panel (assert `data-test="item-panel"` is no longer in the DOM) — verifies the `pushHistoryGuard` integration.
2. RED — Write `AddEditItemSheet.test.ts`: (a) add mode shows "New item" title; (b) edit mode pre-populates name and notes; (c) submitting in add mode calls `addItem`; (d) submitting in edit mode calls `editItem`; (e) cancel closes without calling anything.
3. RED — Write `DeleteItemSheet.test.ts`: (a) shows item name in heading; (b) Cancel does not call `softDeleteItem`; (c) Delete calls `softDeleteItem` with the item id.
4. GREEN — Implement `AddEditItemSheet.svelte` using the `Sheet` primitive.
5. GREEN — Implement `DeleteItemSheet.svelte` using the `Sheet` and `ButtonPair` primitives. Accept `item`, `memberCount`, `ondelete`, and `oncancel` props; render the correct body text per the `memberCount` decision above.
6. GREEN — Replace `ItemsScreen.svelte` stub with full implementation, using `items` store, `VoteControl`, `AddEditItemSheet`, `DeleteItemSheet`, `Fab`, `TopBar`, `Avatar`, `Icon`. (The undo snackbar is a bespoke `<div>`, not the `Snackbar.svelte` primitive — it is added in Task 3.2.)
7. Run `pnpm lint && pnpm check && pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.2 Undo snackbar

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** The undo snackbar is a distinct UI piece with its own timer and FAB-hiding logic. Separating it from task 3.1 keeps each task commit-sized.

**Prerequisites:** Task 3.1 — `ItemsScreen.svelte` full implementation exists; `items.pendingDelete` is wired.

**Decisions:**
- The snackbar is rendered inside `ItemsScreen` when `items.pendingDelete !== null`. Use a bespoke `<div>` — not `Snackbar.svelte`, which has no icon slot and cannot accommodate R11's trash-2 icon.
- Position: shell-aware fixed positioning per `docs/ui.md` § "App shell width and fixed-position elements": `position: fixed; left: max(0px, calc(50% - var(--app-max-w) / 2 + 12px)); right: max(0px, calc(50% - var(--app-max-w) / 2 + 12px)); bottom: calc(env(safe-area-inset-bottom) + 18px)`. Bare `left: 12px; right: 12px` must not be used — it escapes the 26 rem shell on wide screens.
- Content (success path): trash-2 icon, "Deleted '{item.name}'" (item name span uses `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` so a long name — up to 500 chars per the DB constraint — stays single-line), "UNDO" text button (uppercase, sage, weight 700).
- Content (undo-failure path): when `items.error` is non-null after an `undoDelete` attempt, replace the text with "Couldn't restore — item is in trash." and hide the UNDO button. The store's existing 4-second auto-dismiss timer handles the eventual dismissal.
- FAB is hidden (`display: none` or conditional render) when `items.pendingDelete !== null`.
- Tapping UNDO calls `items.undoDelete()`.
- The timer in the store handles auto-dismiss; the snackbar is purely reactive to `items.pendingDelete` and `items.error`.

**Reference:** `design/cairn-screens.jsx` `ItemsScreenWithUndo` for visual spec. `docs/ui.md` § "Undo snackbar" for the safe-area pattern and FAB-hiding rule.

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (modify — add snackbar + FAB conditional)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify — add snackbar tests)

**Steps:**
1. RED — Add to `ItemsScreen.test.ts`: (a) after `softDeleteItem` sets `pendingDelete`, snackbar is visible with item name; (b) FAB is hidden while snackbar is showing; (c) tapping UNDO calls `undoDelete`; (d) when `pendingDelete` is null, snackbar is not in DOM; (e) when `items.error` is non-null (undo failed), snackbar shows "Couldn't restore — item is in trash." and the UNDO button is absent.
2. GREEN — Add snackbar markup and conditional FAB to `ItemsScreen.svelte`.
3. Run `pnpm lint && pnpm check && pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 4 — Playwright E2E

### [ ] 4.1 Playwright touch for the items flow

**Created:** 2026-05-23T18:40:40Z
**Completed:**

**Why:** Per `CLAUDE.md`, new user-visible flows get a Playwright touch. The items screen is the most complex flow in step 4 and exercises the most moving parts.

**Prerequisites:** Tasks 3.1 and 3.2 — `ItemsScreen` is complete and the route exists.

**Decisions:**
- Test file: `web/e2e/items.spec.ts`. Look at existing e2e tests for the test helper and login patterns.
- Scenarios: (a) navigate from lists to a list with items — items are rendered in score-sorted order; (b) tap a row — accordion opens, tap again — closes; (c) tap a second row — first closes, second opens; (d) vote up — indicator updates; (e) tap "Edit" in panel — edit sheet opens with pre-populated fields, save → item name updated; (f) tap "Delete" in panel → confirmation sheet → confirm → snackbar appears with item name; (g) tap UNDO → item returns to list; (h) tap the in-app back button → lands on `/lists` (or use `page.goBack()` to exercise `history.back()`); (i) empty state renders "Nothing here yet" copy and "Add the first item" button.
- The Playwright tests run against the dev server (`pnpm dev`) seeded with the dev database. They use the dev login shortcut (or magic-link flow) same as existing e2e tests.

**Reference:** `docs/testing.md` — Playwright setup and conventions. Existing `web/e2e/` tests for login helper pattern.

**Files:**
- `web/e2e/items.spec.ts` (create)

**Steps:**
1. Read `web/e2e/` to find the existing login helper and test patterns.
2. Write `items.spec.ts` covering the scenarios in Decisions.
3. Run `cd web && pnpm test:e2e -- items.spec.ts` — all scenarios must pass.

**Verify:** `cd web && pnpm exec playwright test web/e2e/items.spec.ts`
