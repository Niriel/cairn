# Plan: Public, read-only, shareable lists

Let a list member publish a list as **public** and share a URL that anyone can
open read-only, without exposing the members. This is the first deliberate
opening of Cairn's `anon` surface, so the security boundary is the central
design concern.

## Context

Today access is binary and entirely membership-based. `lists_select` /
`items_select` gate on `public.is_list_member(id)`
(`db/migrations/0004_domain_schema.sql:654`), and the `anon` PostgREST role has
**zero** grants and **zero** policies — "not logged in" means "no access to any
table, full stop" (`docs/data-model.md`). The infra already routes a cookieless
request to PostgREST as `anon`: Caddy's `/api/*` handler only attaches
`Authorization: Bearer …` when a `cairn_session` cookie is present
(`caddy/Caddyfile.prod`), and `PGRST_DB_ANON_ROLE: anon` is set
(`docker-compose.yml`). So **no Caddy/compose/auth-proxy change is needed** —
the only question is what the database lets `anon` do.

The feature adds a per-list `is_public` flag (R1), an anonymous read-only view
reached at `/p/<list_id>` (R6), a clear in-app "this list is public" marker for
members (R7), and a copy-link affordance (R8). Members keep editing exactly as
now — public is purely an _additional read path_ layered on top; it does not
touch the membership model (R2).

The signed-out route guard lives client-side in `web/src/routes/+layout.svelte`
(redirects signed-out visitors to `/auth/login` unless the path is in
`PUBLIC_CONTENT_PATHS`, `web/src/lib/shared/model/public-paths.ts`). The
sibling `auth-paths.ts` is mirrored verbatim into the production auth-proxy and
guarded against drift, so content routes must go in `public-paths.ts` only.

The list-detail screen is `ItemsScreen.svelte`; its overflow menu is
`ListOverflowSheet.svelte`; the collection lives in
`lists.svelte.ts`; the HTTP layer (`pgGet`/`pgPost`/`pgPatch`) is
`web/src/lib/shared/http/postgrest.ts`. Ranked items come from the
`items_ranked` view.

## Decisions

**One `SECURITY DEFINER` RPC, not direct `anon` table grants (R3, R4).** The
obvious approach — `GRANT SELECT … TO anon` plus a `TO anon` policy — does not
work cleanly. `items_ranked` is declared `WITH (security_invoker = TRUE)`
(`db/migrations/0004_domain_schema.sql:782`), so it inherits the _caller's_
RLS; for `anon` that yields nothing, and flipping it to a definer view would
leak **every** list's scores. Ranking is the whole point of the list, so it
can't be dropped. Embedding (`select=*,list_members(...)`) and base columns
(`created_by`) would each have to be fenced off to honour "hide
members/attribution". A single `SECURITY DEFINER` function returning a curated
JSON payload collapses all of that into **one** auditable surface: `anon`'s
entire footprint becomes one function, members/votes/attribution are excluded
_by construction_, and the view-RLS/embedding traps disappear. This mirrors the
existing RPC-mediated `create_list` pattern
(`db/migrations/0004_domain_schema.sql:586`), which is already idiomatic in
Cairn.

**No new write policy for the toggle (R2).** `authenticated` already has
`GRANT UPDATE ON public.lists` and the `lists_update` policy authorises any
member (`is_list_member(id)`) to update the row. Setting `is_public` is just
another column write — it needs only a pgTAP assertion, not new SQL. A
non-member is already blocked by the same policy; that negative case is tested.

**The list `id` is the share link (R6).** The id is a random uuid v4 —
unguessable, so "anyone with the URL" is exactly the intended audience.
Unpublishing (`is_public = false`) revokes access immediately at the DB. No
separate token table is introduced (see Non-requirements).

**Marker in member views only (R7).** A globe icon after the name, in the
collection row and the detail TopBar, tells a member at a glance that a list is
public. The globe (Lucide) reads as "public/world" and stays visually distinct
from the existing members `users` icon; it must be added to `ICON_PATHS`
(`web/src/lib/basic/model/icon-paths.ts`), which has no globe today. It's
omitted on `/p/` where being public is self-evident. Per project convention
`Icon.svelte` takes no colour prop — colour comes from CSS on a wrapping
container.

**Read-only page is a thin, separate route (R6).** `/p/<list_id>` sits
_outside_ the `(app)` group so it doesn't inherit the signed-in shell, and `/p`
is allowlisted in `public-paths.ts`. It fetches via `pgPost('/rpc/public_list_view', …)`;
a cookieless request runs as `anon`, a signed-in one as `authenticated` — both
granted, both get the same curated payload. Item presentation is reused in a
read-only mode (no vote controls, FAB, overflow, avatars, or attribution).

## Architecture

### New files

- **`db/migrations/0015_public_lists.sql`** — `is_public` column +
  `public_list_view` RPC + `anon`/`authenticated` execute grant. (No extra
  index: the PK already serves the `id = p_id` point lookup; see R1.)
- **`db/tests/public_lists.sql`** — pgTAP: anon positive/negative for the RPC,
  member toggle, non-member denial, attribution-omission assertions.
- **`web/src/routes/p/[list_id]/+page.svelte`** — anonymous read-only view.
- **`web/src/routes/p/[list_id]/page.test.ts`** — Vitest for the read-only view
  (note: route test drops the `+` prefix).
- **`web/e2e/public-list.spec.ts`** — Playwright touch (write-only; unrunnable
  on this machine — see Reference docs).

### Modified files

- **`db/tests/grants.sql`** — extend the `anon` negatives: still no table/view
  SELECT, no other RPC; new positive that `anon` _can_ execute
  `public_list_view`.
- **`db/tests/fixtures/`** — add a public list and a private list fixture.
- **`web/src/lib/list/model/list.ts`** — add `is_public` to the `List` type.
- **`web/src/lib/list/state/lists.svelte.ts`** — select `is_public` in the
  collection query; add the publish/unpublish action.
- **`web/src/lib/list/components/ListOverflowSheet.svelte`** — publish toggle +
  "Copy public link" rows (R8).
- **`web/src/lib/item/components/ItemsScreen.svelte`** — select `is_public` in
  `ListMeta`; render the public marker in the TopBar title (R7); pass
  `isPublic`/refresh `listMeta` into the overflow sheet (R8).
- **Lists-collection row component** (`web/src/lib/list/components/ListsScreen.svelte`)
  — render the public marker after the name (R7); pass `isPublic` into the
  overflow sheet (R8).
- **`web/src/lib/basic/model/icon-paths.ts`** — add the Lucide `globe` icon (R7).
- **Docs:** `docs/data-model.md`, `docs/architecture.md`, `docs/ui.md` (Phase 0).
  (`docs/open-questions.md` has no public-lists entry to resolve — see Phase 0.)

### Anonymous read flow

```
signed-out browser → GET /p/<id> (static SPA, allowlisted in public-paths)
  page load → pgPost /api/rpc/public_list_view { p_id }
    Caddy: no cookie → no Authorization header
      PostgREST: role = anon → EXECUTE public_list_view (granted)
        SECURITY DEFINER body: reads lists + items_ranked under definer privs
          returns curated jsonb  OR  null (non-public / deleted / unknown)
  null → "list not available"   |   object → read-only render
```

## Phase structure

TDD ordering: every DB and JS task writes its failing test first (RED) and the
implementation second (GREEN) within the same task/commit. Phase 0 lands the
doc reconciliation before code so downstream steps reference the updated spec.

0. **Phase 0 — reconcile docs.** `anon` gains a narrow read path, which
   widens the current "`anon` has zero access" statement. Update
   `docs/data-model.md` — amend the "Anonymous users have no access to any
   table" line (≈ `data-model.md:371`) to note `anon` still touches **no**
   table/view but gains exactly one `SECURITY DEFINER` RPC; add the `is_public`
   column + the `public_list_view` RPC as the sole anon path. In
   `docs/architecture.md`, _add_ a one-line note to the request-flow/`anon`
   description (it has no blanket "no access" statement today — only auth-proxy
   text): one read-only RPC for `anon`, everything else closed, no infra change.
   In `docs/ui.md`, define the public marker (globe), the publish/copy-link
   affordance (including the "Copied" feedback — Cairn's first clipboard action,
   so this _establishes_ the convention) and its position above destructive
   actions, and the read-only `/p/` screen. `docs/open-questions.md` has **no**
   public-lists entry to resolve; add a brief decided note only if it fits, else
   skip.
1. **Phase 1 — DB foundation (R1, R3, R4, R5).** Migration `0015`: column +
   index + `public_list_view`; pgTAP `public_lists.sql` and `grants.sql`
   updates with anon positive (RPC works for public) and negatives (private /
   deleted / unknown → null; no table/view/other-RPC access). Member-toggle and
   non-member-denial assertions (R2). See Tasks 1.1–1.2.
2. **Phase 2 — publish toggle + marker (R2, R7, R8).** `is_public` on the type
   and queries; publish/unpublish + copy-link in the overflow sheet; the public
   marker in the collection row and detail TopBar. Vitest for the action and
   the marker. See Tasks 2.1–2.3.
3. **Phase 3 — anonymous read-only view (R3, R6).** `/p/<list_id>` route
   outside `(app)`, `/p` allowlisted in `public-paths.ts`, RPC fetch, read-only
   render, "not available" state. Vitest for the view; Playwright touch
   (write-only). See Tasks 3.1–3.2.

## Reference docs and skills

- **`docs/data-model.md`** — RLS conventions, `is_list_member`, `items_ranked`,
  the grant matrix; the new anon read path is documented here.
- **`docs/testing.md`** — three test layers; pgTAP positive+negative for any
  policy/boundary change.
- **`docs/ui.md`** — TopBar, overflow-sheet button order, copy-link convention,
  the public marker placement.
- **`docs/architecture.md`** — request flow, the `anon` role, Caddy `/api/*`
  shim (confirms no infra change needed).
- **`.claude/skills/writing-tasks.md`** — route-test filename drops `+`;
  cross-task toolchain coupling (navigating to a not-yet-created route).
- **Project memory** — Playwright is machine-conditional: on the laptop
  it cannot run (write specs, report unrunnable, never fake a pass); on the work
  box the chromium + firefox projects run (webkit does not). `Icon.svelte` takes
  no colour prop (colour via CSS container).

## Open questions

- **Description on the public page** — included in the payload (R4). If a list
  description is considered sensitive, a follow-up could let the publisher
  suppress it; default for now is to show it.
