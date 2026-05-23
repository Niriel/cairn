# Plan: Lists screen visual polish

The 0402 step wired up the Lists screen functionally; this plan corrects the visual gap between what shipped and the design spec (`design/cairn-screens.jsx`) so the screen is presentable before 0404 builds the Items screen on top of it.

## Context

After 0402 merged into `0400_mvp_product`, the Lists screen has all the right data plumbing but the visual implementation diverges from the design:

- The TopBar says "Lists" with no Cairn glyph and no subtitle. The design shows a CairnGlyph on the left, title "Cairn", and a "Signed in as [name]" subtitle — a meaningful branding and context signal on the app's root screen.
- List rows are `<ul>/<li>` (browser bullets), names are bare unstyled `<button>` elements, and descriptions are inside the `Accordion` component's header snippet with a nested `<button>` (invalid HTML, misused component).
- The empty state is a small two-line text hint; the design spec shows a full illustrated call-to-action.

Additionally, `docs/ui.md` contains a generic empty-state guideline that contradicts the design spec's illustrated approach, and the TopBar spec doesn't document the `left` and `sub` props that the design has always shown.

## Decisions

**TopBar flex layout.** The current TopBar uses `grid-template-columns: 1fr auto 1fr` to center the title. The design JSX has always used `display: flex` with the title taking `flex: 1`, which means the title sits directly to the right of the `left` element — they are visually adjacent. Switching to flex lets the glyph+title read as a unit on the Lists screen, and it keeps the same layout for all other screens (back button fills the left slot, title follows). The trade-off is that the title is left-aligned rather than geometrically centered when a back button is present; the design accepts this and it's consistent with the JSX spec for every screen in `cairn-screens.jsx`.

**`left` replaces `showBack` when provided (R1).** Rather than a separate prop hierarchy, the rule is simple: if `left` is provided, render it; otherwise fall back to the `showBack` behaviour. Callers don't need to set `showBack={false}` when they pass `left`. Existing callers that use only `showBack` are unaffected.

**No Accordion for list rows (R4).** The shared `Accordion` component is designed for single-open-at-a-time item panels — it pushes history on expand so Android/iOS back closes the panel. List descriptions are different: multiple can be open simultaneously, they don't need history push, and they shouldn't steal `history.back()` presses. Inline CSS expand/collapse is simpler and correct.

**`Set<string>` for expanded state (R4).** The 0402 implementation used a single `expandedId: string | null`. This was already inconsistent with `docs/ui.md`, which says multiple list descriptions can be open simultaneously. A `Set<string>` naturally represents the invariant and makes the toggle logic obvious.

**Description is always rendered, not conditionally (R3).** The design renders a description line for every row — either the description text (truncated or expanded) or `(no description)` in muted italic. This is simpler than the 0402 conditional `{#if description !== null}` branch that chose between Accordion and a bare button, and it means rows always have the same DOM shape.

**Phase 0 for docs (R6).** `docs/ui.md` has two stale sections: the empty-state pattern (two-line text) and the TopBar spec (no `left`/`sub` props, doesn't mention flex layout). Both are corrected in Phase 0 before any code lands, so later plans (especially 0404) reference an accurate spec.

## Architecture

### Modified files

- **`docs/ui.md`** — TopBar spec updated to document flex layout, `left`, and `sub`; empty-state section updated to distinguish simple vs illustrated patterns.
- **`web/src/lib/shared/components/TopBar.svelte`** — add `left?: Snippet`, `sub?: string` props; switch to flex layout.
- **`web/src/lib/shared/components/TopBar.test.ts`** — three new tests: (e) `left` renders, (f) back button absent when `left` provided, (g) `sub` renders.
- **`web/src/lib/shared/components/__mocks__/TopBar.svelte`** — extend stub to accept and ignore `left` and `sub` props (Svelte's `$$restProps` already covers this, but the stub needs to stay in sync with the prop signature for type checking).
- **`web/src/lib/list/components/ListsScreen.svelte`** — full visual overhaul: TopBar with glyph + sub, div-based rows, inline expand/collapse, illustrated empty state.
- **`web/src/lib/list/components/ListsScreen.test.ts`** — update existing tests (c), (e) for new DOM structure; add (f) expand/collapse test, (g) simultaneous-expand test.

### No new files

All work is in existing files. No new routes, stores, or components are introduced.

## Phase structure

0. **Phase 0 — reconcile docs.** Edit `docs/ui.md` to update the TopBar spec (add `left`/`sub`, note flex layout) and the empty-state section (distinguish simple vs illustrated pattern). This lands first — both as a signal that the spec is changing intentionally and so that downstream plan references stay accurate.

1. **Phase 1 — extend TopBar.** Add `left` and `sub` props to `TopBar.svelte`, switch to flex layout, update tests and mock. RED (new tests) then GREEN (implementation). No visual changes to callers; the existing `showBack`/`right` API is fully preserved.

2. **Phase 2 — redesign ListsScreen.** Full visual overhaul of `ListsScreen.svelte`: TopBar usage with glyph and sub, div-based rows with inline expand/collapse (`Set<string>` state), and the illustrated empty state. Update `ListsScreen.test.ts` to match.

## Reference docs and skills

- **`design/cairn-screens.jsx` lines 28–514** — TopBar JSX (lines 28–50), ListsScreen JSX (lines 384–456), EmptyListsScreen JSX (lines 457–514).
- **`docs/ui.md`** — TopBar visual spec (near bottom), empty-state pattern, Lists screen interaction model (tap name navigates, tap description expands).
- **`docs/frontend-layout.md`** — lib tier split and filename conventions.
