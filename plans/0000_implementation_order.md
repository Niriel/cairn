# Cairn — implementation order

## How to read this file

Each numbered step below has a checkbox:

- `[ ]` — to do, not yet implemented.
- `[x]` — done. Tick the box once the matching detailed plan has been
  executed and merged.

## Context

Setup is done (Docker stack, Vitest/Playwright/pgTAP harnesses,
lefthook, ESLint/Prettier/SQLFluff, static SvelteKit adapter, Vite
cookie→bearer shim). The walking-skeleton DB has only `profiles` as a
smoke table; the real domain (`lists`, `items`, `votes`, `circles`, …)
is documented but not migrated. The web app has no auth client, no
PostgREST wrapper, no design tokens, no real screens.

This file decides **the order** in which we build out from here. Each
numbered step gets its own detailed plan, slotted into this directory
as a three-file directory: `plans/<NNNN>_<slug>/{REQUIREMENTS,PLAN,TASKS}.md`
(see `.claude/commands/write-plan.md`). Master-plan steps are
numbered in **hundreds** — step 2 → `0200`, step 3 → `0300`, …,
step 13 → `1300` — leaving 99 free slots between adjacent steps for
the small fixes and refinements big features generate (e.g. `0210`,
`0250`). Step 1 is the one-off exception: `plans/0010_db_foundation/`
keeps its `0010` prefix from before the hundreds convention because
the branch was already published — renumbering would churn the
in-flight branch for no gain.

The list has thirteen steps. Three of them (5 Avatars, 10 Data export,
12 Legal & About) came in via the design handoff at
`docs/handoffs/design_handoff_cairn/` and slot into the build order
where their dependencies make sense — see Sequencing rationale below.

## The order

1. [x] **DB foundation: profiles, lists, list_members, items, votes,
   views, triggers, RLS.** Replaces the smoke `profiles` table. Tiers
   1–2 from `docs/data-model.md`. Set foreign keys with the
   tombstone-friendly `on delete set default` semantics from the start
   (per `docs/account-deletion.md`) so we never ALTER them later.
   pgTAP coverage for every policy, positive *and* negative.

2. [x] **Web foundation: design tokens, theming, layout primitives.** Lift
   `CAIRN_LIGHT` / `CAIRN_DARK` from `design/cairn-ui.jsx`. Decide
   styling approach (plain CSS variables — Tailwind is not in the
   stack). Theme provider, font-size scale, safe-area helpers, and the
   shared primitives that every screen reuses: top-bar, FAB,
   button-pair, snackbar, accordion. Bake the back-stack pattern in
   here too (see `docs/ui.md` → "Navigation and back"): the top-bar
   back arrow calls `history.back()` rather than a hard-coded route;
   every dismissible overlay primitive (sheet, modal, profile sheet,
   accordion-expanded panel) pushes a history state on open and closes
   on `popstate`, so system back and the in-app arrow never disagree.
   Vitest component tests, including a back-stack assertion on at
   least one overlay primitive.

3. [ ] **Auth + HTTP client.** GoTrue magic-link request and "check your
   inbox" screens, session store with refresh, route guard for
   authenticated views, and a thin PostgREST wrapper that attaches the
   bearer token. Vitest unit tests + a Playwright magic-link happy
   path (using Mailpit).

4. [ ] **MVP product surface (single-user happy path).** Lists overview,
   create list, items list with one-at-a-time accordion, add/edit
   item, vote control (±1 nudges, ±3 clamp), settings (theme + font
   size persisted to the browser's `localStorage` — they're
   device-local, not in `user_settings`; see `docs/data-model.md` →
   "Where Cairn stores data"). Empty states for both screens. No
   sharing yet — solo end-to-end. The `<Avatar>` component renders the
   initials-disc fallback only — `profiles.avatar_version` doesn't
   exist yet; step 5 adds the photo branch.

5. [ ] **Avatars (profile pictures).** `0005_avatars.sql` migration:
   `profiles.avatar_version` column + `bump_avatar_version` and
   `clear_avatar` security-definer RPCs (see `docs/avatars.md` →
   "Schema delta"). A small upload sidecar container (Go / Python /
   Node — see `docs/open-questions.md`) that validates magic bytes,
   resizes to 256×256 WebP, writes
   `/srv/cairn/avatars/{uid}.webp`, and calls
   `bump_avatar_version` on PostgREST. Caddy `handle_path /avatars/*`
   read-only static block, with long `Cache-Control` headers. Extend
   the `<Avatar>` component to branch on `avatar_version` (initials
   when 0; cache-busted `<img>` when positive). Edit Profile screen +
   source sheet + crop step + five upload states (see
   `design/cairn-avatar-screens.jsx`). Orphan-sweep cron. pgTAP on the
   column default, the `bump_avatar_version` atomic increment, the
   `clear_avatar` reset, and the `tg_set_modified_at` extension.

6. [ ] **Soft-delete UX.** Undo snackbar pattern, per-list trash (now
   reachable from the list overflow menu's *View trash* row, in
   addition to Settings → Recovery), account trash, restore flow.
   Refines step 4 — items and lists were already soft-deletable in
   step 1, this exposes the surface. The deleted-user tombstone
   renders with `avatar_version = 0` (gray disc, no initials), so the
   tombstone visual lands here once avatars are in place.

7. [ ] **Invites + circles + blocks: DB layer.** Tier 3 from data-model:
   create `relationships` (the merged circle/blocklist — one row per
   directed pair, with `status` enum `'circle' | 'blocked'`) and
   `invitations`. The `invite_policy` column already ships on
   `user_settings` from step 1 — see `data-model.md` "Why `profiles`
   and `user_settings` are split". The five RPCs (`send_invitation`,
   `accept_invitation`, `decline_invitation`, `add_circle_by_email`,
   `add_circle_by_id`) as `security definer` — function names keep
   the user-facing "circle" vocabulary even though the bodies write
   `relationships` rows. RLS + pgTAP.

8. [ ] **Invites + circles + blocks: UI layer.** Privacy settings screen,
   circle screen, blocked screen, circle explainer sheet, invites
   inbox (with banner on lists screen), invite picker sheet, profile
   sheet (state-driven actions), members screen, list overflow menu
   (rename/edit/leave/delete/view-trash).

9. [ ] **Account deletion.** Tombstone user/profile insert, the
   `delete_account()` RPC, deletion confirmation screen with typed
   "delete" gate, and tombstone attribution UI ("Deleted user" muted
   italic, gray-disc avatar). FK semantics already in place from step
   1, so this is mostly tombstone + RPC + UI. The web app's post-RPC
   `DELETE /avatars/me` call to the sidecar lands here too (the
   sidecar is already running from step 5). See
   `docs/account-deletion.md`.

10. [ ] **Data export (GDPR portability).** `export_my_data()`
    security-definer RPC returning per-user JSONB (see
    `docs/data-export.md` → "How the export is produced"). Settings →
    Privacy & data → **Download my data** row, hub, packaging,
    ready/download screens. Client-side ZIP assembly (no server
    staging — the archive lives in the tab's memory). Co-member avatar
    embeds best-effort. Delete-account-screen *"Want a copy first?"*
    integration panel (E5 in `design/cairn-export-screens.jsx`).
    pgTAP coverage on per-user filtering and on the rejection of
    `uid = tombstone`.

11. [ ] **PWA shell.** `manifest.webmanifest`, icons, install prompts, and
    a minimal service worker for the read-only offline behaviour
    described in `docs/architecture.md` (offline-first conflict
    resolution is explicitly *not* a v1 goal).

12. [ ] **Legal & About surface.** About hub (L1), Privacy policy (L2 —
    references `docs/logging.md`), Terms of service (L3), Imprint
    (L4 — every legally-required field must be filled in by launch;
    needs a German-speaking lawyer's pass — see
    `docs/open-questions.md`), Open source attributions (L5), Contact
    (L6), Cairn license (L7). Mostly static content; no DB work. See
    `design/cairn-legal-screens.jsx`.

13. [ ] **Production rollout.** Add the missing `caddy/Caddyfile.prod`,
    `.env.prod` template, Restic backup script, the avatar sidecar
    container in `docker-compose.prod.yml`, the
    `/srv/cairn/avatars/` directory + permissions, and walk through
    the first Hetzner deploy following `docs/deployment.md`. The
    imprint screen's placeholders must be replaced with the real
    company / contact details before the deploy goes public.
    Production smoke check.

## Sequencing rationale

- DB before UI so RLS-backed product code has something real to talk
  to.
- Design tokens / primitives (step 2) before auth UI (step 3) so the
  magic-link screens are built with the same primitives as everything
  else — no throwaway styling.
- MVP (step 4) before sharing (steps 7–8): a working single-user app
  is the smallest thing worth dogfooding, and it shakes out the auth
  and PostgREST plumbing before we add the more intricate invite
  RPCs.
- **Avatars (step 5) before soft-delete UX (step 6)** because the
  tombstone visual in step 6 leans on `avatar_version = 0` selecting
  the initials-disc fallback. Putting avatars first also means every
  later step gets a face on every name without retrofitting.
- Soft-delete UX (step 6) before invites: it's a small refinement of
  step 4 and surfaces the trash/undo patterns that the invite flows
  also rely on.
- Account deletion (step 9) after invites because the tombstone has
  to re-point attribution on shared content created during sharing
  flows.
- **Data export (step 10) after account deletion (step 9)** because
  the export hub integrates with the Delete account screen via the
  *"Want a copy first?"* panel — building both in adjacent plans means
  the integration is one plan's responsibility, not a cross-plan
  handoff.
- PWA shell (step 11) before legal/about (step 12) so the install
  experience is in place when we start surfacing the privacy /
  imprint / OSS attribution screens that a careful user will look
  for around installation.
- **Legal & About (step 12) before production rollout (step 13)**
  because the imprint is a launch-blocker under German law (operating
  out of a Hetzner DE box) — the page must exist and must carry real
  fields, not placeholders, on the day the box goes public.
- Production rollout (step 13) last: deployable and installable is
  the polish layer once the product works.

## Verification

When all thirteen plans are executed: `./scripts/check.sh` is green,
`pnpm test:e2e` covers the MVP + invite + avatar + export happy paths,
the dev stack lets a developer sign in via Mailpit and exercise every
screen in the design canvas (including the avatar upload + export +
legal flows), `docs/open-questions.md` is empty (or its remaining
bullets have been deliberately deferred post-v1 with a one-line
reason), and the production stack is reachable at `cairn.<domain>`
with an installable PWA, a complete Imprint, a working data-export
download, and avatars served from disk.
