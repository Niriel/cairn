# Tasks

## Reference skills and docs

- **`design/cairn-screens.jsx` lines 28–514** — TopBar JSX (28–50), ListsScreen (384–456), EmptyListsScreen (457–514). Read these before implementing any visual change.
- **`docs/ui.md`** — TopBar spec, empty-state conventions, Lists screen interaction model.
- **`docs/frontend-layout.md`** — lib tier split and filename rules.

---

## Phase 0 — Reconcile docs

### [x] 0.1 Update docs/ui.md — TopBar spec and empty-state pattern

**Created:** 2026-05-23T17:04:13Z
**Completed:** 2026-05-23T17:10:10Z

**Why:** `docs/ui.md` currently describes the TopBar as having a three-column grid layout with no `left` or `sub` props, and describes all empty states using a simple two-line text pattern. Both contradict the design spec in `design/cairn-screens.jsx`. Fixing the docs first ensures downstream plans (especially 0404) reference an accurate spec.

**Prerequisites:** None.

**Decisions:**
- Edit `docs/ui.md` in two places:
  1. **TopBar visual spec section** — add that the TopBar now uses `display: flex; align-items: center; gap: 10px` (not a three-column grid). Document the `left?: Snippet` prop (renders in the leading slot; overrides the back button when provided) and the `sub?: string` prop (secondary line, 12 px, `var(--stone)`, rendered below the title).
  2. **Empty-state section** — the two-line guideline ("No lists yet." / "Tap [icon] to create one.") applies to simple empty states. For screens with an illustrated empty state (like the Lists screen), the pattern is: a centred circle illustration + a serif heading + body copy + CTA button. Both patterns are valid; the choice depends on the screen's design spec.
- No code changes in this task — docs only.

**Files:**
- `docs/ui.md` (modify)

**Steps:**
1. In `docs/ui.md`, find the "### TopBar visual spec" section. Add after the existing bullet list:
   - The TopBar uses `display: flex; align-items: center; gap: 10px` (flex, not a three-column grid). The title div has `flex: 1; min-width: 0`.
   - Optional `left?: Snippet` prop: rendered in the leading slot; when provided, replaces the back button (`showBack` is ignored). Example: `<CairnGlyph>` on the Lists screen root.
   - Optional `sub?: string` prop: secondary line rendered directly below the title, 12 px, `var(--stone)`.
2. In `docs/ui.md`, find the "### Empty-state copy and style" section. Expand it to note two patterns:
   - **Simple empty state:** two short lines ("No lists yet." / "Tap [icon] to create one."), `var(--stone)`, ≥ 22 px, inline FAB-hint icon with `background: var(--accent); color: var(--paper); border-radius: 50%`.
   - **Illustrated empty state** (used on the Lists screen): centred circle (96 × 96 px, `background: var(--paper-alt)`, `border: 1px dashed var(--stone-lt)`, `border-radius: 99px`) containing `<CairnGlyph size={44} color="var(--stone)" />`; Newsreader 24 px weight 500 heading; 14 px body copy; CTA button (`background: var(--ink); color: var(--paper)`, border-radius 12 px). Use the pattern specified by the screen's design JSX.

**Verify:** `cd web && pnpm lint` (Prettier will reformat Markdown if needed)

---

## Phase 1 — Extend TopBar

### [x] 1.1 Add `left` and `sub` props to TopBar, switch to flex layout

**Created:** 2026-05-23T17:04:13Z
**Completed:** 2026-05-23T17:18:08Z

**Why:** The Lists screen design (and the design spec for every other screen in `cairn-screens.jsx`) uses a flex-row TopBar where the `left` element and title are visually adjacent. Adding `left` and `sub` unblocks the ListsScreen redesign in Phase 2.

**Prerequisites:** None — TopBar is a self-contained component with no DB dependency.

**Decisions:**
- New props: `left?: Snippet` and `sub?: string`. Both optional; all existing callers (`ListsScreen`, `SettingsScreen`) continue to work without modification.
- Layout change: replace `display: grid; grid-template-columns: 1fr auto 1fr` with `display: flex; align-items: center; gap: 10px`. The left slot (back button or `left` snippet) sits at the leading edge; the title div has `flex: 1; min-width: 0`; the right slot (`right` snippet) sits at the trailing edge.
- `left` takes priority over `showBack`: `{#if left}{@render left()}{:else if showBack}<back-button>{/if}`.
- `sub` renders inside the title div as a second line: `<div class="sub">{sub}</div>` below the title text. 12 px, `var(--stone)`.
- The mock at `__mocks__/TopBar.svelte` accepts the new props via `$$restProps` (already the case) but its TypeScript interface needs updating to keep `pnpm check` happy.

**Reference:** `design/cairn-screens.jsx` lines 28–50 for the exact flex layout and sub-text style.

**Files:**
- `web/src/lib/shared/components/TopBar.svelte` (modify)
- `web/src/lib/shared/components/TopBar.test.ts` (modify)
- `web/src/lib/shared/components/__mocks__/TopBar.svelte` (modify)

**Steps:**
1. RED — In `TopBar.test.ts`, add three new tests:
   - `(e) renders the left snippet when provided` — pass `left: span('L', 'left-slot')`, assert `getByDataTest('left-slot')` exists.
   - `(f) does not render back button when left is provided` — pass `left: span('L')`, assert `queryByDataTest('topbar-back')` is null.
   - `(g) renders sub text when sub prop provided` — pass `sub: 'hello sub'`, assert the rendered text includes "hello sub".
2. RED — Run `cd web && pnpm test -- TopBar` and confirm the three new tests fail.
3. GREEN — In `TopBar.svelte`:
   a. Add `left?: Snippet` and `sub?: string` to the props destructure.
   b. Replace `{#if showBack}…{/if}` in the left div with `{#if left}{@render left()}{:else if showBack}…{/if}`.
   c. Render `sub` below the title: `{#if sub}<div class="sub">{sub}</div>{/if}`.
   d. In `<style>`: replace the `header { display: grid; grid-template-columns: 1fr auto 1fr }` rule with `display: flex; align-items: center; gap: 10px`. Give `.centre` `flex: 1; min-width: 0; text-align: left` (was `text-align: center`). Add `.sub { font-size: 12px; color: var(--stone); margin-top: 2px; }`.
4. GREEN — Update `__mocks__/TopBar.svelte` prop types to include `left?: Snippet` and `sub?: string`.
5. GREEN — Run `cd web && pnpm test -- TopBar` and confirm all tests pass.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test -- TopBar`

---

## Phase 2 — Redesign ListsScreen

### [x] 2.1 Overhaul ListsScreen rows, TopBar usage, and empty state

**Created:** 2026-05-23T17:04:13Z
**Completed:** 2026-05-23T17:24:41Z

**Why:** The functional Lists screen from 0402 has unstyled `<ul>/<li>` rows, a misused Accordion, and a minimal empty state. This task replaces all three with the design-spec layout.

**Prerequisites:** Task 1.1 completed — TopBar has `left` and `sub` props and flex layout.

**Decisions:**
- **TopBar:** `showBack` is no longer needed. Use `left={CairnGlyph}`, title "Cairn", `sub="Signed in as {profile.displayName}"` (omit `sub` entirely when `profile.displayName` is null). Import `CairnGlyph` from `$lib/shared/components/CairnGlyph.svelte` and `profile` from `$lib/shared/state/profile.svelte`.
- **Row markup:** A `<div class="list">` container; inside, `{#each}` over `lists.items` producing `<div class="row" data-test="list-row-{item.id}">`. Each row has a `.row-inner` flex container (align-items: baseline, gap 12px) with a `.row-body` div (flex: 1) and a trailing `<Icon name="chevron-right">`.
- **Name:** A `<button class="name" data-test="list-nav-{item.id}">` inside `.row-body`. Newsreader 17 px, weight 600, ink colour, no underline, no default button styling.
- **Description:** A `<button class="desc" data-test="list-desc-{item.id}">` below the name inside `.row-body`. When `item.description` is non-null: shows description text, cursor pointer, toggles expand on click. When `item.description` is null: shows "(no description)", `var(--stone)`, italic, not interactive (use `disabled` attribute or render as `<div>` instead). CSS for collapsed: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. For expanded: `white-space: normal`.
- **Expand state:** `let expandedIds = $state(new Set<string>())`. Toggle: `expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id); expandedIds = expandedIds` (Svelte reactivity requires reassignment).
- **Metadata:** A `.meta` div: 11.5 px, `var(--stone)`. Shows `formatDate(item.modified_at)` — use `new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(item.modified_at))`.
- **Row border:** `border-bottom: 1px solid var(--rule)` on all rows (CSS `&:last-child { border-bottom: none }` removes it from the last row).
- **Empty state:** Matches R5 exactly. The CTA button sets `createSheetOpen = true` (same as the Fab).
- **Fab:** The `<Fab>` is still present and still opens the create sheet.
- **Accordion import removed** — no longer needed.
- The existing test mock for `Accordion` in `ListsScreen.test.ts` is removed. The tests for expand/collapse now test the real DOM structure.

**Reference:** `design/cairn-screens.jsx` lines 384–514 for the exact DOM structure, font sizes, colours, and empty state. `docs/ui.md` "Lists screen" section for the interaction model (name tap → navigate, description tap → expand).

**Files:**
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)

**Steps:**
1. RED — Update `ListsScreen.test.ts`:
   a. Remove `vi.mock('$lib/shared/components/Accordion.svelte')` — Accordion is no longer used.
   b. Add `vi.mock('$lib/shared/components/CairnGlyph.svelte')` (or verify TopBar mock absorbs it).
   c. Update test `(b)` ("shows empty state"): assert `queryByDataTest('lists-empty')` is not null. Add a sub-assertion that the empty-state element contains a button with text "Create your first list" (data-test `lists-empty-cta`).
   d. Update test `(e)` ("navigate to list on row click"): it currently clicks `list-nav-{id}` — this stays the same since the name button keeps that data-test.
   e. Add test `(f)`: "clicking description with content expands it" — set `lists.items = [LIST_B]` (description: 'A description'), render, assert `.desc` is not expanded (check no `.expanded` class or check `white-space` via class), click `list-desc-{LIST_B.id}`, tick, assert it is expanded.
   f. Add test `(g)`: "two descriptions can be expanded simultaneously" — set `lists.items = [LIST_A_WITH_DESC, LIST_B]` where `LIST_A_WITH_DESC` has a description. Expand both. Assert both are in expanded state.
   g. Add test `(h)`: "null-description row renders (no description) and is not interactive" — set `lists.items = [LIST_A]` (description: null), assert `list-desc-{LIST_A.id}` contains "(no description)". Assert clicking it does not change expand state (no toggle).
2. RED — Run `cd web && pnpm test -- ListsScreen` and confirm new/changed tests fail.
3. GREEN — Rewrite `ListsScreen.svelte`:
   a. Remove the `Accordion` import.
   b. Import `CairnGlyph` from `$lib/shared/components/CairnGlyph.svelte`.
   c. Import `profile` from `$lib/shared/state/profile.svelte`.
   d. Replace `let expandedId = $state<string | null>(null)` with `let expandedIds = $state(new Set<string>())`.
   e. Add `function toggleDesc(id: string) { if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id); expandedIds = expandedIds; }`.
   f. Add `function formatDate(iso: string): string { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); }`.
   g. Rewrite the template per Decisions above.
   h. Add CSS: `.list`, `.row`, `.row-inner`, `.row-body`, `.name`, `.desc`, `.desc.expanded`, `.meta`, `.empty` styles per the design spec values in Decisions.
4. GREEN — Run `cd web && pnpm test -- ListsScreen` and confirm all tests pass.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

---

## Phase 3 — Complete metadata row

### [x] 3.1 DB migration — `lists_item_count` function and `list_members → profiles` FK

**Created:** 2026-05-23T17:35:11Z
**Completed:** 2026-05-23T17:41:24Z

**Why:** The metadata row (R3) requires an item count and member avatars. Item count needs a PostgreSQL computed-column function that PostgREST v12 can expose; member display names need a FK from `list_members.user_id` to `public.profiles(id)` so PostgREST can embed profiles in the lists response.

**Prerequisites:** `0004_domain_schema.sql` exists with `public.lists`, `public.list_members`, `public.items`, and `public.profiles` tables.

**Decisions:**
- Migration file: `db/migrations/0005_list_metadata.sql`.
- FK: `ALTER TABLE public.list_members ADD CONSTRAINT fk_list_members_profile FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE`. Safe because `profiles.id = auth.users.id` always; Postgres deduplicates the two cascade paths (via `auth.users` and via `profiles`) on user deletion.
- Computed column function: `CREATE FUNCTION public.lists_item_count(l public.lists) RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$ SELECT count(*)::bigint FROM public.items WHERE list_id = l.id AND deleted_at IS NULL $$;` — security-invoker by default, so `items_select` RLS applies.
- Grant: `GRANT EXECUTE ON FUNCTION public.lists_item_count(public.lists) TO authenticated;`
- pgTAP test file: `db/tests/0050_list_metadata.sql`. Three assertions: (a) function returns correct count for a list with items, (b) count excludes soft-deleted items, (c) FK constraint `fk_list_members_profile` exists on `list_members`.

**Reference:** `docs/data-model.md` for table structures and the test bootstrap pattern. `docs/testing.md` for pgTAP conventions.

**Files:**
- `db/migrations/0005_list_metadata.sql` (create)
- `db/tests/0050_list_metadata.sql` (create)

**Steps:**
1. RED — Create `db/tests/0050_list_metadata.sql` with `SELECT plan(3)`:
   - Test (a): seed a list and two non-deleted items; call `public.lists_item_count(row)` and assert result = 2.
   - Test (b): soft-delete one item (`deleted_at = now()`); call the function again and assert result = 1.
   - Test (c): assert the constraint `fk_list_members_profile` exists on table `list_members` using `has_foreign_pk` or `col_is_fk`.
2. RED — Run `./scripts/test-db.sh` and confirm the new file reports `not ok` (function and constraint don't exist yet).
3. GREEN — Create `db/migrations/0005_list_metadata.sql`:
   ```sql
   -- FK: enables PostgREST to embed profiles from list_members
   ALTER TABLE public.list_members
     ADD CONSTRAINT fk_list_members_profile
     FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

   -- Computed column: item count for the lists PostgREST resource
   CREATE FUNCTION public.lists_item_count(l public.lists)
     RETURNS bigint LANGUAGE sql STABLE SET search_path = public
   AS $$
     SELECT count(*)::bigint FROM public.items
     WHERE list_id = l.id AND deleted_at IS NULL
   $$;

   GRANT EXECUTE ON FUNCTION public.lists_item_count(public.lists) TO authenticated;
   ```
4. GREEN — Run `./scripts/test-db.sh` and confirm green.

**Verify:** `./scripts/test-db.sh`

### [ ] 3.2 Frontend — extend List type, query, and metadata row rendering

**Created:** 2026-05-23T17:35:11Z
**Completed:**

**Why:** With the DB infrastructure from task 3.1, the PostgREST query can now return item counts and member display names. This task wires those fields into the `List` type, the fetch query, and the `ListsScreen` metadata row.

**Prerequisites:** Task 3.1 merged — `fk_list_members_profile` constraint and `lists_item_count` function exist in the DB.

**Decisions:**
- **`List` type** gains `item_count: number` and `list_members: { profiles: { display_name: string } }[]`.
- **Query**: `GET /lists?select=id,name,description,modified_at,item_count:lists_item_count(),list_members(profiles(display_name))&list_members.deleted_at=is.null&order=modified_at.desc`. The `list_members.deleted_at=is.null` filter restricts embedded members to live ones (the `list_members_select` policy alone does not exclude soft-deleted rows).
- **`timeAgo(iso)` replaces `formatDate(iso)`**:
  ```ts
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(iso));
  }
  ```
- **Metadata row** (replacing the single date span):
  ```svelte
  <div class="meta">
    <span>{item.item_count} {item.item_count === 1 ? 'item' : 'items'}</span>
    <span class="dot">•</span>
    <span>{timeAgo(item.modified_at)}</span>
    {#if item.list_members.length > 0}
      <span class="dot">•</span>
      <span class="avatars">
        {#each item.list_members as m, i}
          <span style="margin-left: {i === 0 ? 0 : -6}px">
            <Avatar displayName={m.profiles.display_name} size={16} />
          </span>
        {/each}
      </span>
    {/if}
  </div>
  ```
  Import `Avatar` from `$lib/shared/components/Avatar.svelte`.
- **Test fixtures**: all existing test fixtures (`LIST_A`, `LIST_B`, `LIST_C`) must gain `item_count: 0` and `list_members: []` to satisfy the updated type. Test `(i)` checks that item count text is rendered.
- **`docs/ui.md`**: add a sentence to the "Lists screen" section noting the metadata row (count · relative time · member avatars).

**Reference:** `design/cairn-screens.jsx` lines 430–452 for the metadata row layout. `web/src/lib/shared/components/Avatar.svelte` for the `displayName` and `size` props.

**Files:**
- `web/src/lib/list/model/list.ts` (modify)
- `web/src/lib/list/state/lists.svelte.ts` (modify)
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)
- `docs/ui.md` (modify)

**Steps:**
1. RED — In `ListsScreen.test.ts`:
   a. Add `item_count: 0` and `list_members: []` to all existing fixtures (`LIST_A`, `LIST_B`, `LIST_C`).
   b. Add test `(i)`: "metadata shows item count" — set `lists.items = [{ ...LIST_B, item_count: 3, list_members: [] }]`, render, assert the text "3 items" is in the document.
2. RED — Run `cd web && pnpm test -- ListsScreen` and confirm new test fails (type errors on fixtures and missing "3 items" text).
3. GREEN — Update `web/src/lib/list/model/list.ts`: add `item_count: number` and `list_members: { profiles: { display_name: string } }[]` to the `List` type.
4. GREEN — Update `web/src/lib/list/state/lists.svelte.ts`: change the `pgGet` URL to the extended query in Decisions.
5. GREEN — Update `web/src/lib/list/components/ListsScreen.svelte`:
   a. Replace `formatDate` with `timeAgo` (body from Decisions).
   b. Import `Avatar` from `$lib/shared/components/Avatar.svelte`.
   c. Replace the `.meta` div content with the full metadata row from Decisions (count • time • avatars).
   d. Add `.dot { color: var(--stone-lt); }` and `.avatars { display: inline-flex; align-items: center; }` to `<style>`.
6. GREEN — Update `docs/ui.md` "Lists screen" section: add "Each row also shows a metadata line: item count, time since last modification, and avatar initials of current members."
7. GREEN — Run `cd web && pnpm test -- ListsScreen` and confirm all tests pass.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`
