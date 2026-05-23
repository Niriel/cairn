# Tasks

## Reference skills and docs

- **`.claude/skills/write-plan.md`** — how to create a sub-plan directory (branch, number, slug, three files).
- **`plans/0400_mvp_product/REQUIREMENTS.md`** — full step-4 requirements (R1–R10); each sub-plan refines a subset.
- **`docs/data-model.md`** — schema and RLS reference for the sub-plans that touch the DB.
- **`docs/frontend-layout.md`** — lib tier split and filename conventions for sub-plans that build components.

---

## Phase 1 — 0401: Avatar + Settings

### [x] 1.1 Plan and implement sub-step 0401 (Avatar component + Settings screen)

**Created:** 2026-05-23T07:51:04Z
**Completed:** 2026-05-23T09:13:06Z

**Why:** The `Avatar` component and Settings screen are foundational — Avatar
is used in the Settings profile chip and later in item attribution; Settings
exposes the theme/font-size controls that `preferences.svelte.ts` already
implements but has no UI for. Both must land before the screens that depend on
them.

**Prerequisites:** `0400_mvp_product` branch exists and is checked out.

**Decisions:**
- Sub-branch is cut from `0400_mvp_product`, not from `main`.
- The plan covers: `Avatar.svelte` (initials-disc only, no photo branch),
  a `Profile` reactive store that fetches `display_name` from PostgREST,
  and a Settings screen with profile chip + Appearance section + Sign Out.
- No DB migration — Avatar in this sub-step reads only `display_name` from
  the existing `profiles` table.

**Steps:**
1. `git checkout -b 0401_avatar_settings 0400_mvp_product`
2. Invoke `/write-plan` to create `plans/0401_avatar_settings/` with its
   REQUIREMENTS.md, PLAN.md, and TASKS.md.
3. Implement the sub-plan task by task (via `/work` or manually).
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0400_mvp_product && git merge --no-ff 0401_avatar_settings`

**Verify:** `./scripts/check.sh` green on `0400_mvp_product` after merge.

---

## Phase 2 — 0402: Lists screen

### [x] 2.1 Plan and implement sub-step 0402 (Lists screen)

**Created:** 2026-05-23T07:51:04Z
**Completed:** 2026-05-23T00:00:00Z

**Why:** The Lists screen is the authenticated home — users land here after
sign-in. It requires one new DB piece (`create_list` RPC) and establishes the
authenticated route layout that the Items screen (0404) will also live under.

**Prerequisites:** Task 1.1 merged — `0400_mvp_product` contains the Avatar
component and the Settings screen; the authenticated layout stub may be
introduced here.

**Decisions:**
- Sub-branch cut from the updated `0400_mvp_product` (post-0401 merge).
- The plan covers: `create_list(name, description)` security-definer RPC +
  pgTAP, `/(app)/+layout.svelte` route guard, Lists overview screen (fetch
  `GET /lists`, `Accordion` for descriptions, `Fab` → create sheet, empty
  state), and the placeholder `/+page.svelte` becoming a redirect to `/lists`.
- Existing primitives used: `Accordion`, `Fab`, `Sheet`, `TopBar`.

**Steps:**
1. `git checkout -b 0402_lists_screen 0400_mvp_product`
2. Invoke `/write-plan` to create `plans/0402_lists_screen/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0400_mvp_product && git merge --no-ff 0402_lists_screen`

**Verify:** `./scripts/check.sh` green on `0400_mvp_product` after merge.

---

## Phase 3 — 0403: Lists screen visual polish

### [x] 3.1 Plan and implement sub-step 0403 (Lists screen visual polish)

**Created:** 2026-05-23T00:00:00Z
**Completed:** 2026-05-23T18:33:37Z

**Why:** The 0402 task delivered the functional plumbing but the visual
implementation diverges significantly from the design spec. List rows render
as unstyled `<ul>/<li>` elements with browser-default bullet points, names as
bare `<button>` elements with no layout, and the `Accordion` is misused by
nesting a `<button>` inside its header. The TopBar lacks the Cairn glyph and
subtitle. The empty state is a two-line text hint rather than the illustrated
call-to-action. This must be corrected before 0404 builds the Items screen
on top of it.

**Prerequisites:** Task 2.1 merged — `0400_mvp_product` contains the Lists
screen and the authenticated layout.

**Decisions:**
- Sub-branch cut from the updated `0400_mvp_product` (post-0402 merge).
- The plan covers: extend `TopBar` with a `left` snippet and `sub` text prop;
  redesign `ListsScreen` rows (div-based, Newsreader 17 px bold name,
  description always shown and collapsible, `modified_at` metadata, chevron);
  fix empty state (illustrated circle + CTA button matching design spec).
- No DB changes — uses existing `List` model fields (`name`, `description`,
  `modified_at`). Icon, items count, and member avatars are out of scope
  (no data yet).

**Steps:**
1. `git checkout -b 0403_lists_screen_polish 0400_mvp_product`
2. Invoke `/write-plan` to create `plans/0403_lists_screen_polish/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0400_mvp_product && git merge --no-ff 0403_lists_screen_polish`

**Verify:** `./scripts/check.sh` green on `0400_mvp_product` after merge.
Open `/lists` in the browser: no bullet points, rows match design spec, empty
state shows the illustrated circle and CTA button.

---

## Phase 4 — 0404: Items screen

### [ ] 4.1 Plan and implement sub-step 0404 (Items screen + vote control + accordion)

**Created:** 2026-05-23T07:51:04Z
**Completed:**

**Why:** The Items screen is the heaviest piece of step 4 — it combines the
vote control, the one-at-a-time accordion, and the add/edit/delete item flows.
It depends on the Lists screen (0402/0403) for the route structure it navigates
from.

**Prerequisites:** Task 3.1 merged — `0400_mvp_product` contains the visually
polished Lists screen.

**Decisions:**
- Sub-branch cut from the updated `0400_mvp_product` (post-0403 merge).
- The plan covers: Items screen (`/(app)/lists/[list_id]/`), `VoteControl`
  (±1 nudge, ±3 clamp, upsert/delete via PostgREST), item accordion (one open
  at a time, notes + attribution + per-member votes panel + Edit/Delete
  buttons), add-item sheet, edit-item sheet, soft-delete with `Snackbar` undo.
- Existing primitives used: `Accordion`, `Fab`, `Sheet`, `Snackbar`, `TopBar`,
  `ButtonPair`.
- No new DB migration — all DB pieces (items, votes, items_ranked, RLS) are
  already in place from step 1.

**Steps:**
1. `git checkout -b 0404_items_screen 0400_mvp_product`
2. Invoke `/write-plan` to create `plans/0404_items_screen/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 0400_mvp_product && git merge --no-ff 0404_items_screen`

**Verify:** `./scripts/check.sh --e2e` green on `0400_mvp_product` after merge.

---

## Phase 5 — Wrap up

### [ ] 5.1 Final verification and merge to main

**Created:** 2026-05-23T07:51:04Z
**Completed:**

**Why:** Confirms the full step-4 happy path works end-to-end on the
integration branch before it lands on `main`.

**Prerequisites:** Tasks 1.1, 2.1, 3.1, 4.1 all merged into `0400_mvp_product`.

**Decisions:**
- Run the full E2E suite (sign in → lists → items → vote → edit → delete →
  settings → sign out) before merging.
- Tick step 4's checkbox in `plans/0000_implementation_order.md` as part of
  the merge commit.

**Steps:**
1. On `0400_mvp_product`, run `./scripts/check.sh --e2e` — must be green.
2. Edit `plans/0000_implementation_order.md`: change `4. [ ]` to `4. [x]`.
3. Commit: `chore(plan): tick step 4 in implementation order`.
4. `git checkout main && git merge --no-ff 0400_mvp_product`

**Verify:** `./scripts/check.sh --e2e` green on `main`.
