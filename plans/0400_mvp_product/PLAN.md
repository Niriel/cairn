# Plan: MVP product surface (single-user happy path)

Step 4 of the master plan — the first real product screens. This plan is an
orchestration plan: rather than implementing directly, its phases create and
execute three sub-plans, each on its own branch, which are then merged back
into `0400_mvp_product` before the step is merged to `main`.

## Context

Steps 1–3 are merged. The stack has:
- **DB:** `lists`, `items`, `votes`, `items_ranked`, `items_deleted`,
  `lists_deleted`, full RLS, `public.uid()`, `public.is_list_member()`.
- **Frontend primitives:** `Button`, `ButtonPair`, `Sheet`, `Fab`, `TopBar`,
  `Snackbar`, `Accordion`, `Icon` (all in `lib/basic/` or `lib/shared/`).
- **State:** `preferences.svelte.ts` (theme + font-size, persisted to
  `localStorage`), `session.svelte.ts` (auth state), `back-stack.svelte.ts`.
- **HTTP:** `postgrest.ts` (`pgGet`, `pgPost`, `pgPatch`, `pgDelete`) with
  cookie-based auth, 401 handling, and `ApiError` parsing.
- **Auth flows:** login request, login check, callback, dev shortcuts (gated
  to `import.meta.env.DEV`).
- **Placeholder home:** `/+page.svelte` reads "Signed in. Lists land in step 4."

What's missing: the `Avatar` component, the Settings screen, the Lists screen,
the Items screen with vote control and accordion, and the `create_list` RPC.

## Decisions

**Orchestration via sub-branches, not a single big branch.** Step 4 is large
enough that landing it all in one PR would make review and bisection hard. Each
sub-step (0401 / 0402 / 0403 / 0404) gets its own branch cut from `0400_mvp_product`,
its own detailed write-plan, its own PR merged into `0400_mvp_product`, and is
verified independently before the next sub-step starts. `0400_mvp_product` is
then merged into `main` once all four are in.

**Sub-step order is load-bearing.** `Avatar` is used in Settings (profile
chip) and in item attribution in step 4, so it must land first (0401). Lists
must exist before we can navigate into Items (0402 before 0404). The Lists
screen visual polish (0403) fixes the row layout, TopBar branding, and empty
state before Items is built, so Items can navigate from a screen that actually
looks right. Items is the heaviest sub-step and benefits from the route and
navigation structure that Lists establishes (0404 last).

**The 0400 plan is deliberately thin.** The requirements and architecture of
each sub-step live in their own plan directories (`plans/0401_*/`,
`plans/0402_*/`, `plans/0403_*/`, `plans/0404_*/`). This plan's job is to document the
decomposition rationale and provide the merge/verification checklist.

## Architecture

This plan creates no source files directly. Each sub-plan creates its own
files; see those plans for the per-file inventory.

### New plan directories (created by this plan's tasks)

- **`plans/0401_avatar_settings/`** — Avatar component, Profile state, Settings screen.
- **`plans/0402_lists_screen/`** — `create_list` RPC, authenticated layout, Lists screen.
- **`plans/0403_lists_screen_polish/`** — Lists screen visual polish: row layout, TopBar branding, empty state.
- **`plans/0404_items_screen/`** — Items screen, VoteControl, item accordion, add/edit/delete flows.

### Branches

```
main
 └─ 0400_mvp_product               ← this plan's branch (base for sub-steps)
     ├─ 0401_avatar_settings        ← merges back into 0400_mvp_product
     ├─ 0402_lists_screen           ← merges back into 0400_mvp_product
     ├─ 0403_lists_screen_polish    ← merges back into 0400_mvp_product
     └─ 0404_items_screen           ← merges back into 0400_mvp_product
```

## Phase structure

1. **Phase 1 — 0401: Avatar + Settings.** Create branch
   `0401_avatar_settings` from `0400_mvp_product`. Write its detailed plan
   with `/write-plan`. Implement and verify. Merge back into
   `0400_mvp_product`.

2. **Phase 2 — 0402: Lists screen.** Create branch `0402_lists_screen` from
   the updated `0400_mvp_product`. Write its detailed plan with `/write-plan`.
   Implement and verify. Merge back.

3. **Phase 3 — 0403: Lists screen visual polish.** Create branch
   `0403_lists_screen_polish` from the updated `0400_mvp_product`. Write its
   detailed plan with `/write-plan`. Bring `ListsScreen` into alignment with
   the design spec (row layout, TopBar branding, empty state). Implement and
   verify. Merge back.

4. **Phase 4 — 0404: Items screen.** Create branch `0404_items_screen` from
   the updated `0400_mvp_product`. Write its detailed plan with `/write-plan`.
   Implement and verify. Merge back.

5. **Phase 5 — Wrap up.** Run `./scripts/check.sh --e2e` on
   `0400_mvp_product`. Tick step 4's checkbox in
   `plans/0000_implementation_order.md`. Merge `0400_mvp_product` into `main`.

## Reference docs and skills

- **`docs/data-model.md`** — lists/items/votes schema, RLS policies, views.
- **`docs/ui.md`** — button order, back-stack pattern, navigation conventions.
- **`docs/frontend-layout.md`** — lib tier split, filename rules, mock placement.
- **`docs/testing.md`** — three test layers; pgTAP for RLS, Vitest for components, Playwright for flows.
- **`.claude/skills/write-plan.md`** — how to write the sub-plan directories.
- **`.claude/skills/writing-tasks.md`** — task format each sub-plan must follow.
