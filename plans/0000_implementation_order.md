# Cairn — implementation order

## How to read this file

Each numbered step below has a checkbox:

- `[ ]` — to do, not yet implemented.
- `[x]` — done. Tick the box once the matching detailed plan has been
  executed and merged.

Mid-range refinements (the 99-slot entries like `0301`) appear as
sub-bullets under the master-plan step they refine, and tick the
same `[ ]` / `[x]` convention. They don't get their own numbered
list position — the parent step's hundreds slot is their home.

## Orchestration plans

Some steps are large enough that landing them in a single plan and branch
makes review and bisection hard. For those, create an **orchestration plan**:
a `0N00`-numbered branch whose `TASKS.md` does not contain implementation
tasks directly, but instead creates and executes numbered sub-branches
(`0N01`, `0N02`, …), each with its own `/write-plan` and its own
REQUIREMENTS/PLAN/TASKS. When all sub-branches are merged back into `0N00`,
`0N00` is merged into `main` and the step's checkbox is ticked.

The sub-branch numbers slot into the 99-slot gap the hundreds convention
leaves (e.g. `0401`, `0402`, `0403` under `0400`). Each sub-plan is a normal
plan — the only thing that makes `0N00` special is that its tasks say
"create sub-branch → `/write-plan` → implement → merge back" rather than
writing code directly. `plans/0400_mvp_product/` is the worked example.

All merges of sub-branches back into the orchestration branch, and of the
orchestration branch back into `main`, use `--no-ff` so the branch grouping
is visible on the commit tree.

Use this pattern when a step would otherwise produce a PR too large to review
in one pass. Prefer a single plan for steps that are large but coherent.

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
step 15 → `1500` — leaving 99 free slots between adjacent steps for
the small fixes and refinements big features generate (e.g. `0210`,
`0250`). Step 1 is the one-off exception: `plans/0010_db_foundation/`
keeps its `0010` prefix from before the hundreds convention because
the branch was already published — renumbering would churn the
in-flight branch for no gain.

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

3. [x] **Auth + HTTP client.** GoTrue magic-link request and "check your
   inbox" screens, session store with refresh, route guard for
   authenticated views, and a thin PostgREST wrapper that attaches the
   bearer token. Vitest unit tests + a Playwright magic-link happy
   path (using Mailpit).
   - [x] **0301: gate the dev-login shortcut so it doesn't ship to
     prod.** Svelte's runtime `{#if}` in `LoginRequest.svelte` does
     not prune the dead branch in the prod bundle — `pnpm build` +
     grep confirms the three seed emails, the "Sign in as ..."
     template, and the `/token?grant_type=password` helper all land
     in `web/build/_app/immutable/`. Extract a `DevShortcuts.svelte`
     and load it via a literal `if (import.meta.env.DEV)` dynamic
     import so the module and its transitive imports drop from the
     prod graph entirely; verify by re-grepping the post-build
     bundle for `alice@example.test`. Must land before step 15's
     deploy. Background and the three deploy-time watch items live at
     `docs/deployment.md` → "Auth surface: pre-deploy checklist";
     the general convention this implements is at
     `docs/development.md` → "Gating dev-only UI so it doesn't ship
     to prod".
   - [x] **0302: honour the magic-link anti-enumeration contract in
     the sign-in UI.** `docs/admin.md` → "What the web app shows when
     a banned user tries to sign in" requires the post-submit screen
     to be identical for every outcome GoTrue can produce (link
     sent, banned, unconfirmed, rate-limited, unknown email). The
     current `LoginRequest.svelte` violates this: 4xx renders an
     inline *"Please check the email and try again"* and 5xx flips
     an error snackbar — both distinguish failure from success.
     Replace with: treat any non-2xx from `POST /auth/magiclink`
     as a success in the UI (navigate to `LoginCheck` regardless,
     no inline error, no error snackbar). Apply the design-handoff
     copy fixes the same pass: *"a link to continue"* in
     `LoginRequest.svelte`, *"Tap it on this device to continue"*
     in `LoginCheck.svelte` (the design canvas already has them,
     the Svelte didn't follow). Update the Vitest tests in
     `LoginRequest.test.ts` and the Playwright `auth.spec.ts` to
     assert the new shape, including a non-2xx branch that still
     lands on `LoginCheck`. Must land before step 15's deploy so
     the contract is honoured on day 1 of production. Background:
     `docs/admin.md` § "What the web app shows…" and the *"02b ·
     One screen, five outcomes"* artboard in the design canvas.
   - [x] **0303: strip the OTP code from the magic-link email.**
     GoTrue's default magic-link template includes both
     `{{ .ConfirmationURL }}` (the link) and `{{ .Token }}` (a
     six-digit code). Cairn's sign-in flow is link-only — there is
     no code-entry screen, and a code in the email is a surface
     the user can be social-engineered into reading aloud over
     the phone. Configure GoTrue to use a custom template
     (`GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` pointing at a mounted
     HTML file) that renders only the link, the brand, and a one-line
     *"if you didn't request this, ignore it"* note. Same for the
     plaintext fallback. Land the template file under
     `gotrue/templates/magic_link.html`, wire it into
     `docker-compose.yml` (and the prod compose at step 15) as a
     read-only bind mount, and add a Playwright assertion that
     Mailpit's captured email contains the link **and does not
     contain a six-digit numeric token**. Must land before step
     15's deploy so prod's first email is link-only.

4. [x] **MVP product surface (single-user happy path).** Lists overview,
   create list, items list with one-at-a-time accordion, add/edit
   item, vote control (±1 nudges, ±3 clamp), settings (theme + font
   size persisted to the browser's `localStorage` — they're
   device-local, not in `user_settings`; see `docs/data-model.md` →
   "Where Cairn stores data"). Empty states for both screens. No
   sharing yet — solo end-to-end. The `<Avatar>` component renders the
   initials-disc fallback only — `profiles.avatar_version` doesn't
   exist yet; step 5 adds the photo branch.

5. [x] **Avatars (profile pictures).** `0007_avatars.sql` migration:
   `profiles.avatar_version` column + `bump_avatar_version` and
   `clear_avatar` security-definer RPCs (see `docs/avatars.md` →
   "Schema delta"). A small upload sidecar container (TypeScript/Node —
   decided 2026-05; see `plans/0500_avatars/PLAN.md`) that validates magic bytes,
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

6. [x] **Soft-delete UX.** Undo snackbar pattern, per-list trash (now
   reachable from the list overflow menu's *View trash* row, in
   addition to Settings → Recovery), account trash, restore flow.
   Refines step 4 — items and lists were already soft-deletable in
   step 1, this exposes the surface. The deleted-user tombstone
   renders with `avatar_version = 0` (gray disc, no initials), so the
   tombstone visual lands here once avatars are in place.

7. [x] **Invites + circles + blocks: DB layer.** Tier 3 from data-model:
   create `relationships` (the merged circle/blocklist — one row per
   directed pair, with `status` enum `'circle' | 'blocked'`) and
   `invitations`. The `invite_policy` column already ships on
   `user_settings` from step 1 — see `data-model.md` "Why `profiles`
   and `user_settings` are split". The five RPCs (`send_invitation`,
   `accept_invitation`, `decline_invitation`, `add_circle_by_email`,
   `add_circle_by_id`) as `security definer` — function names keep
   the user-facing "circle" vocabulary even though the bodies write
   `relationships` rows. RLS + pgTAP.

8. [x] **Invites + circles + blocks: UI layer.** Privacy settings screen,
   circle screen, blocked screen, circle explainer sheet, invites
   inbox (with banner on lists screen), invite picker sheet, profile
   sheet (state-driven actions), members screen, list overflow menu
   (Rename / Edit description / Manage members / View bin / Leave list / Delete list).

9. [x] **Refactoring pass: factor out repeating CSS into components.**
   Audit-driven cleanup once the screen inventory from steps 4–8 is
   stable. The same handful of CSS blocks (outlined-pill buttons,
   chip-shaped panel actions, empty-state CTAs, `.row-icon`
   `inline-flex; color:…` wrappers, `.section-label` typography rules,
   ad-hoc `<div class="…">` scaffolding for what is structurally a
   header / section / heading / list) keep getting copy-pasted across
   screens because the existing primitives don't cover the shapes the
   design needs. Visual consistency lives in `git grep`, not in code —
   one screen tweaks a colour and the others quietly drift. Three
   parts:
   - **Consolidate raw `<button>` elements behind a small set of button
     components.** `Button` today covers only `primary` / `ghost` /
     `destructive` filled-rectangle shapes; screens reach past it for
     outlined pills, chip-shaped panel actions, empty-state CTAs, the
     row-level Restore on `TrashScreen`, `.panel-btn` and `.empty-cta`
     in `ItemsScreen`, and so on. Audit first, then define a limited
     variant set (rough hypothesis: filled-rect, outlined-pill,
     ghost-text, icon-only) with a small parameter surface (size,
     leading icon, destructive tone) and migrate.
   - **Give `Icon` a `color` prop (or an idiomatic wrapper) so screens
     stop copy-pasting `.row-icon { display: inline-flex; color: … }`
     spans.** `Icon` strokes with `currentColor`, so any non-default
     colour today requires a parent `inline-flex; color: …` span. Pick
     whichever approach lets call sites read as
     `<Icon name="rotate-ccw" color="var(--stone)" />` without an
     intermediate `<span>`.
   - **Replace ad-hoc `<div class="…">` scaffolding with semantic
     HTML.** Egregious case: `InvitePickerSheet.svelte`, whose sheet
     header, section labels, and per-row blocks are all div-with-class
     instead of `<header>`, `<section>`, `<h2>` / `<h3>`, `<ul> / <li>`.
     Per-screen CSS then re-implements typography rules (`.section-label`,
     `.name`, `.sub`, …) that should live once at the top level keyed
     off the semantic tag — or in a small set of dedicated components.
     Sweep every screen under `web/src/lib/**/components/*.svelte`,
     record the intended semantics, and replace with semantic tags +
     top-level CSS (or extract a shared component where the same
     pattern recurs). Accessibility benefit is real too — landmarks,
     heading hierarchy, and list semantics all become free.
   - **Row/sheet/menu separators are CSS borders between siblings,
     not `<hr>`.** [Reconsidered — the original prescription, "replace
     `border-bottom`-as-separator with `<hr>`", was reversed in plan
     0902, R9.] A divider between adjacent sibling rows is
     presentational, not semantic: keep it as a `1px solid var(--rule)`
     border on the adjacent siblings (`.rows .row`, `.menu > li + li`,
     `nav-row + nav-row`). `<hr>` is not used — it is invalid as a
     direct `<ul>` child and carries no useful document semantics here,
     and the global `hr` reset is dropped once the last `<hr>` is gone.

   Aim is to minimise repetition without exploding the API; if a shape
   only appears once, keep it inline rather than minting a variant for
   it. No behaviour change in the user-visible product; every existing
   Vitest / Playwright test must still pass without touching the
   assertions.

10. [ ] **Account deletion.** Tombstone user/profile insert, the
   `delete_account()` RPC, deletion confirmation screen with typed
   "delete" gate, and tombstone attribution UI ("Deleted user" muted
   italic, gray-disc avatar). FK semantics already in place from step
   1, so this is mostly tombstone + RPC + UI. The web app's post-RPC
   `DELETE /avatars/me` call to the sidecar lands here too (the
   sidecar is already running from step 5). See
   `docs/account-deletion.md`.

11. [ ] **Admin: schema, audit table, RPCs, CLI.** Land
    `db/migrations/0006_admin.sql` (numbering pending — slot it after
    whatever the deletion migration takes) creating the `admin`
    schema, the `admin.actions` audit table, and the eight RPCs
    sketched in `docs/admin.md` (`ban_user`, `unban_user`,
    `delete_account_as`, `moderate_item`, `purge_item`,
    `moderate_list`, `purge_list`, `inspect_user`). The `admin`
    schema must **not** be on `PGRST_DB_SCHEMAS`, so PostgREST
    cannot reach it — that structural unreachability is the
    primary defence; the `cairn_admin` Postgres role + per-column
    grants are the secondary defence. Every destructive RPC takes
    a required `reason` (CHECK-constrained, non-empty) and writes
    one row to `admin.actions` in the same transaction, with the
    pre-state snapshot in `payload`. pgTAP coverage in
    `db/tests/admin_*.sql`: the reason-empty CHECK rejects, the
    audit row writes atomically, `purge_*` cascades correctly,
    `delete_account_as` produces the same end-state as the
    user-initiated `delete_account()` from step 10. Plus the
    `scripts/cairn-admin` shell (Python; SET ROLE discipline; no
    `--yes` flag without a `--reason`). No web-app changes — admin
    is operator-over-SSH only; see `docs/admin.md` § "Why no admin
    UI". Depends on step 1 (`auth.users` exists, the data model is
    settled) and step 10 (the `delete_account()` shape and tombstone
    semantics that `delete_account_as` mirrors).

12. [ ] **Data export (GDPR portability).** `export_my_data()`
    security-definer RPC returning per-user JSONB (see
    `docs/data-export.md` → "How the export is produced"). Settings →
    Privacy & data → **Download my data** row, hub, packaging,
    ready/download screens. Client-side ZIP assembly (no server
    staging — the archive lives in the tab's memory). Co-member avatar
    embeds best-effort. Delete-account-screen *"Want a copy first?"*
    integration panel (E5 in `design/cairn-export-screens.jsx`).
    pgTAP coverage on per-user filtering and on the rejection of
    `uid = tombstone`.

13. [ ] **PWA shell.** `manifest.webmanifest`, icons, install prompts, and
    a minimal service worker for the read-only offline behaviour
    described in `docs/architecture.md` (offline-first conflict
    resolution is explicitly *not* a v1 goal).

14. [ ] **Legal & About surface.** About hub (L1), Privacy policy (L2 —
    references `docs/logging.md`), Terms of service (L3), Imprint
    (L4 — every legally-required field must be filled in by launch;
    needs a German-speaking lawyer's pass — see
    `docs/open-questions.md`), Open source attributions (L5), Contact
    (L6), Cairn license (L7). Mostly static content; no DB work. See
    `design/cairn-legal-screens.jsx`.

15. [ ] **Production rollout.** Add the missing `caddy/Caddyfile.prod`,
    `.env.prod` template, Restic backup script, the avatar sidecar
    container in `docker-compose.prod.yml`, the
    `/srv/cairn/avatars/` directory + permissions, and walk through
    the first Hetzner deploy following `docs/deployment.md`. The
    imprint screen's placeholders must be replaced with the real
    company / contact details before the deploy goes public.
    Production smoke check. **Auth hardening from Step 3:** the
    production GoTrue service MUST set
    `GOTRUE_MAILER_AUTOCONFIRM=false` and
    `GOTRUE_DISABLE_SIGNUP=true` so the committed dev password
    (`cairn-dev`, used by Step 3's seed flow and dev login
    shortcut) cannot be used against prod and so `POST
    /auth/signup` cannot create unsolicited accounts. Cairn is
    invite-only per `docs/invites.md`, so signup-disabled is the
    correct default; this line exists as a checklist item so the
    step-15 owner can't miss it. See also the same forward-note
    in `docs/development.md` under "Seed data".

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
- **Refactoring pass (step 9) between invites UI and account deletion**
  because the screen inventory is stable enough by step 8 to see which
  CSS blocks are genuinely recurring vs. one-offs, and doing the
  consolidation before steps 10–14 add more screens means those later
  screens are built on the consolidated primitives rather than
  retrofitting them. Out of scope while screens are still being built;
  the placement here is the "stable enough" mark.
- Account deletion (step 10) after invites because the tombstone has
  to re-point attribution on shared content created during sharing
  flows.
- **Admin (step 11) after account deletion (step 10)** because
  `admin.delete_account_as` mirrors the user-initiated
  `delete_account()` shape — building the user path first means the
  admin path can copy it rather than the two diverging. Admin also
  needs the full data model settled (items, lists, soft-delete,
  tombstone) so `moderate_*` and `purge_*` have their targets in
  place. Lands before step 15 so the operator has a banhammer and
  an audit trail on day 1 of production.
- **Data export (step 12) after account deletion (step 10)** because
  the export hub integrates with the Delete account screen via the
  *"Want a copy first?"* panel — building both in adjacent plans means
  the integration is one plan's responsibility, not a cross-plan
  handoff. Slotted after admin (step 11) but doesn't depend on it;
  the order is data-shape stability, not a hard dependency.
- PWA shell (step 13) before legal/about (step 14) so the install
  experience is in place when we start surfacing the privacy /
  imprint / OSS attribution screens that a careful user will look
  for around installation.
- **Legal & About (step 14) before production rollout (step 15)**
  because the imprint is a launch-blocker under German law (operating
  out of a Hetzner DE box) — the page must exist and must carry real
  fields, not placeholders, on the day the box goes public.
- Production rollout (step 15) last: deployable and installable is
  the polish layer once the product works.

## Verification

When every plan above is executed: `./scripts/check.sh` is green,
`pnpm test:e2e` covers the MVP + invite + avatar + export happy paths,
the dev stack lets a developer sign in via Mailpit and exercise every
screen in the design canvas (including the avatar upload + export +
legal flows) without the sign-in screen ever distinguishing failure
from success (the 0302 anti-enumeration contract), the operator can
ban / unban / moderate / purge / inspect from the VPS via
`cairn-admin` and every destructive action lands in `admin.actions`
with a non-empty `reason`, `docs/open-questions.md` is empty (or its
remaining bullets have been deliberately deferred post-v1 with a
one-line reason), and the production stack is reachable at
`cairn.<domain>` with an installable PWA, a complete Imprint, a
working data-export download, and avatars served from disk.
