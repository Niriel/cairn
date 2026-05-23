# Requirements: Lists screen visual polish

The 0402 step delivered a functional Lists screen but its visual implementation diverges significantly from the design spec in `design/cairn-screens.jsx`. This plan corrects those divergences so the screen matches the spec before the Items screen (0404) builds on top of it.

## R1. TopBar supports a `left` snippet and a `sub` text prop

`TopBar.svelte` accepts two new optional props:

- `left?: Snippet` — rendered in the left slot. When provided, it replaces the back button (the `showBack` prop still controls the back button when `left` is absent). When `left` is provided, `showBack` is ignored.
- `sub?: string` — a secondary line rendered below the title, 12 px, `var(--stone)` colour.

The TopBar layout changes from a three-column grid (`1fr auto 1fr`) to a flex row (`display: flex; align-items: center; gap: 10px`) so the left element and title are visually adjacent. The title div gets `flex: 1; min-width: 0`. This matches the design JSX in `design/cairn-screens.jsx` lines 28–50. All existing callers continue to work without modification.

## R2. Lists screen TopBar shows the Cairn glyph and a "Signed in as" subtitle

The Lists screen `<TopBar>` uses:
- `left` = `<CairnGlyph size={26} color="var(--accent)" />`
- title = "Cairn"
- `sub` = `"Signed in as <display_name>"` when `profile.displayName` is non-null; omitted otherwise
- `right` = settings icon button (unchanged)

`showBack` is no longer needed on the Lists screen; the `left` slot carries the glyph instead.

## R3. List rows are div-based with explicit styling

List rows replace the current `<ul>/<li>` markup (which renders browser bullet points) and the misused `Accordion` component. Each row uses a `<div>` wrapper with:

- `padding: 14px 18px`
- `border-bottom: 1px solid var(--rule)` (omitted on the last row)
- Row body: flex row, `align-items: baseline`, with the text block taking `flex: 1`
- **Name:** Newsreader 17 px, weight 600, `var(--ink)`. Clicking the name navigates to the list.
- **Description:** always rendered below the name; 13.5 px, `line-height: 1.5`. When the list has a description and it is collapsed: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, `color: var(--ink-soft)`. When expanded: `white-space: normal`, same colour. When the list has no description: renders the literal text `(no description)` in `color: var(--stone); font-style: italic`; clicking it does nothing (or is not a button).
- **Metadata line:** 11.5 px, `var(--stone)`; shows three elements separated by `•` bullet dots: (1) item count ("N items", singular "1 item"), (2) relative time since `modified_at` ("2 hours ago", "3 days ago", falling back to a locale date for older entries), (3) a row of overlapping `<Avatar>` initials discs (size 16, −6 px margin on non-first) for each live list member.
- **Chevron:** `<Icon name="chevron-right" size={18} color="var(--stone-lt)" />` on the trailing edge.

## R4. Multiple list descriptions can be expanded simultaneously

The expand/collapse state for list description rows is tracked as a `Set<string>` of expanded list IDs, not a single nullable ID. Clicking a description with content toggles membership in the set. This matches `docs/ui.md` which states that multiple descriptions may be open at once on the Lists screen.

The `Accordion` component is not used for list rows; the expand/collapse is handled with local state and CSS.

## R5. Empty state shows an illustrated circle and CTA button

When `lists.items` is empty and `lists.loading` is false, the Lists screen renders:

- A centred column layout filling the remaining viewport height.
- A 96 × 96 px circle: `background: var(--paper-alt); border: 1px dashed var(--stone-lt); border-radius: 99px`. Inside: `<CairnGlyph size={44} color="var(--stone)" />`.
- Heading text: Newsreader 24 px, weight 500, `var(--ink)`, letter-spacing `−0.01em`: "Start your first cairn".
- Body copy 14 px, `var(--ink-soft)`, line-height 1.5, max-width 280 px: "A cairn is a small stack of stones hikers leave to mark the way. Make a list of things — movies, books, places — and share it with friends."
- A CTA button: `background: var(--ink); color: var(--paper)`, border-radius 12 px, padding 12 px 22 px, weight 600, 14 px, with a `<Icon name="plus" size={16} />` prefix. Label: "Create your first list". Clicking it opens `CreateListSheet`.

## R6. docs/ui.md is updated to reflect the illustrated empty state

`docs/ui.md` currently describes a generic two-line empty-state pattern ("No lists yet." / "Tap [icon] to create one.") and inline FAB-hint styling that does not match the design for the Lists screen. The doc is updated to:

1. Clarify that the two-line guideline applies to *simple* empty states; elaborate illustrated empty states (like the Lists screen) use the illustrated circle + CTA pattern from the design spec instead.
2. Note that the TopBar now uses a flex layout (not the previous grid) and supports `left` and `sub` props.

## R7. `lists_item_count` PostgreSQL computed-column function

A PostgreSQL function `public.lists_item_count(l public.lists) RETURNS bigint` counts non-soft-deleted items for a given list row. PostgREST v12 exposes computed-column functions in the `select` parameter as `item_count:lists_item_count()`. The function is `LANGUAGE sql STABLE` (security-invoker by default), so `items_select` RLS applies correctly — a user only counts items they can see. `GRANT EXECUTE` is given to `authenticated`.

## R8. FK `list_members.user_id → profiles(id)` for PostgREST resource embedding

PostgREST follows FK chains to resolve embedded resource joins. `list_members.user_id` currently references `auth.users(id)` but not `public.profiles(id)` directly, so PostgREST cannot find the path to `profiles.display_name`. Adding the constraint `fk_list_members_profile FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE` fixes this. The values are always consistent (`profiles.id = auth.users.id`), so the constraint is always satisfiable.

## R9. `List` type and PostgREST query extended to include item count and member display names

`web/src/lib/list/model/list.ts` adds two fields:

```ts
item_count: number;
list_members: { profiles: { display_name: string } }[];
```

`web/src/lib/list/state/lists.svelte.ts` updates the query to:

```
/lists?select=id,name,description,modified_at,item_count:lists_item_count(),list_members(profiles(display_name))&list_members.deleted_at=is.null&order=modified_at.desc
```

`list_members.deleted_at=is.null` filters the embedded resource to live members only (the `list_members_select` RLS policy does not filter `deleted_at` automatically).

## Non-requirements (explicitly excluded)

- **Row icon** — the list-icon field (`l.icon` in design JSX) is excluded; no icon data exists in the current schema.
- **Accordion component reuse for list rows** — list rows manage their own expand/collapse state; the shared `Accordion` component uses `pushHistoryGuard` which is appropriate for item panels but not for list description previews that can be multiply-open.
- **Animation** — deferred per `docs/ui.md` "Not decided".
