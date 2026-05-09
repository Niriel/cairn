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
step 10 → `1000` — leaving 99 free slots between adjacent steps for
the small fixes and refinements big features generate (e.g. `0210`,
`0250`). Step 1 is the one-off exception: `plans/0010_db_foundation/`
keeps its `0010` prefix from before the hundreds convention because
the branch was already published — renumbering would churn the
in-flight branch for no gain.

## The order

1. [ ] **DB foundation: profiles, lists, list_members, items, votes,
   views, triggers, RLS.** Replaces the smoke `profiles` table. Tiers
   1–2 from `docs/data-model.md`. Set foreign keys with the
   tombstone-friendly `on delete set default` semantics from the start
   (per `docs/account-deletion.md`) so we never ALTER them later.
   pgTAP coverage for every policy, positive *and* negative.

2. [ ] **Web foundation: design tokens, theming, layout primitives.** Lift
   `CAIRN_LIGHT` / `CAIRN_DARK` from `design/cairn-ui.jsx`. Decide
   styling approach (plain CSS variables — Tailwind is not in the
   stack). Theme provider, font-size scale, safe-area helpers, and the
   shared primitives that every screen reuses: top-bar, FAB,
   button-pair, snackbar, accordion. Vitest component tests.

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
   sharing yet — solo end-to-end.

5. [ ] **Soft-delete UX.** Undo snackbar pattern, per-list trash, account
   trash, restore flow. Refines step 4 — items and lists were already
   soft-deletable in step 1, this exposes the surface.

6. [ ] **Invites + circles + blocks: DB layer.** Tier 3 from data-model:
   create `relationships` (the merged circle/blocklist — one row per
   directed pair, with `status` enum `'circle' | 'blocked'`) and
   `invitations`. The `invite_policy` column already ships on
   `user_settings` from step 1 — see `data-model.md` "Why `profiles`
   and `user_settings` are split". The five RPCs (`send_invitation`,
   `accept_invitation`, `decline_invitation`, `add_circle_by_email`,
   `add_circle_by_id`) as `security definer` — function names keep
   the user-facing "circle" vocabulary even though the bodies write
   `relationships` rows. RLS + pgTAP.

7. [ ] **Invites + circles + blocks: UI layer.** Privacy settings screen,
   circle screen, blocked screen, circle explainer sheet, invites
   inbox (with banner on lists screen), invite picker sheet, profile
   sheet (state-driven actions), members screen, list overflow menu
   (rename/edit/leave/delete).

8. [ ] **Account deletion.** Tombstone user/profile insert, the
   `delete_account()` RPC, deletion confirmation screen with typed
   "delete" gate, and tombstone attribution UI ("Deleted user" muted
   italic). FK semantics already in place from step 1, so this is
   mostly tombstone + RPC + UI.

9. [ ] **PWA shell.** `manifest.webmanifest`, icons, install prompts, and
   a minimal service worker for the read-only offline behaviour
   described in `docs/architecture.md` (offline-first conflict
   resolution is explicitly *not* a v1 goal).

10. [ ] **Production rollout.** Add the missing `caddy/Caddyfile.prod`,
    `.env.prod` template, Restic backup script, and walk through the
    first Hetzner deploy following `docs/deployment.md`. Production
    smoke check.

## Sequencing rationale

- DB before UI so RLS-backed product code has something real to talk
  to.
- Design tokens / primitives (step 2) before auth UI (step 3) so the
  magic-link screens are built with the same primitives as everything
  else — no throwaway styling.
- MVP (step 4) before sharing (steps 6–7): a working single-user app
  is the smallest thing worth dogfooding, and it shakes out the auth
  and PostgREST plumbing before we add the more intricate invite
  RPCs.
- Soft-delete UX (step 5) before invites: it's a small refinement of
  step 4 and surfaces the trash/undo patterns that the invite flows
  also rely on.
- Account deletion (step 8) after invites because the tombstone has
  to re-point attribution on shared content created during sharing
  flows.
- PWA and production (steps 9–10) last: deployable and installable is
  a polish layer once the product works.

## Verification

When all ten plans are executed: `./scripts/check.sh` is green,
`pnpm test:e2e` covers the MVP + invite happy paths, the dev stack
lets a developer sign in via Mailpit and exercise every screen in the
design canvas, and the production stack is reachable at
`cairn.<domain>` with an installable PWA.
