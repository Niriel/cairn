# Plan: Invites + circles + blocks: UI layer

Step 8 of the master plan — the screens, sheets, and small DB
additions that turn step 7's Tier-3 data model into a usable invite
and circle product surface. This plan is an **orchestration plan** in
the `0N00` mould: `0800_invites_circles_ui` lands no implementation
itself; it cuts and merges three sub-branches (`0801`, `0802`, `0803`)
that each carry a coherent slice of the UI work.

## Context

After step 7 the stack has:

- **DB:** `relationships` and `invitations` tables, all RLS policies,
  and the five RPCs (`add_circle_by_email`, `add_circle_by_id`,
  `send_invitation`, `accept_invitation`, `decline_invitation`).
  The block auto-decline trigger lives on `relationships`. `docs/invites.md`
  explicitly defers two further triggers — policy-change cascade and
  the 20-invite FIFO cap — to step 8.
- **Web app:** Settings has Profile / Appearance / Text size /
  Recovery / Account sections only. The Lists screen and the list
  overflow exist; the items screen and the avatar/profile self-edit
  screens are wired. No code touches `relationships` or `invitations`
  yet. The HTTP wrappers, sheet primitive, snackbar, avatar, back-stack,
  and Vitest harness are all production-ready.
- **Docs:** `docs/invites.md` and `docs/circles.md` are the canonical
  UX spec. `design/cairn-invite-screens.jsx` is the canonical visual
  spec (carry exact copy and tokens forward into each sub-plan's
  REQUIREMENTS). `design/cairn-screens.jsx` carries the Members
  screen and the six-row List menu reference.

Step 8 surfaces nine screens/sheets and updates three existing ones
(Settings, Lists overview, ListOverflowSheet) plus a tiny DB migration
for the two deferred triggers. That's too big for a single PR to
review cleanly, so the work is split.

## Decisions

**Orchestration in three sub-plans, not two and not a single branch.**
Step 7's two-sub-plan split landed with each sub-plan carrying ~2
tasks — too thin, in retrospect. Step 8's natural cleavage lines are
*settings-side surfaces*, *the profile sheet primitive that several
later surfaces consume*, and *the invite-flow surfaces that depend on
the first two*. Each slice is ~10–15 tasks, reviewable in a sitting,
and useful on its own.

**0801 lands the relationships state module that 0802 and 0803
reuse.** The Svelte `relationships.svelte.ts` module belongs with the
Circle and Blocked screens that introduce it. Both later sub-plans
import from it (0802 to render the profile sheet's status badge, 0803
to populate the picker's *Your circle* section). Folding it into the
earliest sub-plan avoids producer-after-consumer ordering pain.

**0802 ships the profile sheet as a reusable component before 0803
wires it into the inbox and members screens.** The profile sheet is a
shared primitive — it opens from member avatars on the lists overview
(already present today; 0802 wires the tap target), from inbox row
inviters (0803), from picker rows (0803), and from members screen rows
(0803). Building it as a stand-alone deliverable that lands and is
tested before its dependents is exactly the toolchain-coupling
discipline `docs/quality.md` calls out.

**0803 lands the invite flow and the two new overflow rows together.**
The Lists-screen banner, Invites inbox, post-accept circle prompt,
invite picker, Members screen, *Manage members* overflow row, and
*Leave list* overflow row all share the `invitations.svelte.ts`
module and several copy strings. Splitting them further would mean
landing the picker without a way to open it, or the Members screen
without a button to invite from. Keeping them together makes the
e2e specs straightforward.

**Two DB triggers ship in 0801, not in their own branch.** The
policy-cascade trigger (R11) and the FIFO-cap trigger (R12) are both
small additions touching tables step 7 already shipped. They could
have been deferred or shipped as a separate DB branch, but: the
policy-cascade trigger is the back-end half of 0801's Privacy screen
(without it, the screen would PATCH `user_settings` and the inbox
would not update — a misleading half-implementation); and a separate
DB-only branch for two triggers would re-create exactly the
too-thin-sub-plan problem 0700 had. Landing both as part of 0801,
co-located with the screen that depends on them, keeps the slice
coherent.

**Block uses direct table writes, not a new `block_user` RPC.** Step
7's `relationships_insert` / `relationships_update` / `relationships_delete`
policies are already gated on `user_id = public.uid()`, which is
exactly the block/unblock semantics. The UI calls `pgPost('/relationships',
{user_id: me, other_user_id: them, status: 'blocked'})` with `Prefer:
resolution=merge-duplicates` (or an upsert RPC if PostgREST's merge
support proves shaky in 0802's exploration) and `pgDelete('/relationships?…')`
for unblock. A wrapper RPC would be ceremony for nothing.

**Cancel-pending-invite is a direct `DELETE /invitations?…`.** Step 7
already grants `SELECT` on `invitations` to `authenticated`; the
`invitations_select` policy lets the inviter see their own row. The
0802 sub-plan adds `invitations_delete` policy (`created_by =
public.uid()`) and a `DELETE` grant in a tiny supplemental migration
— this is a step-7 non-requirement that the doc flagged as "step 8
will add it." Single-line addition with pgTAP, sitting next to the
profile-sheet code it serves.

**Post-accept circle prompt is session-scoped, not persisted.** A
user who dismisses the prompt and signs in fresh next session will
see it again on their next acceptance — fine; it's a soft nudge and
not worth a `user_settings` column. Tracked via a SvelteSet of
inviter UIDs in `invitations.svelte.ts`.

**British English in user-facing copy; US English in identifiers.**
Per CLAUDE.md. Examples: copy says "favourite", "e-mail" (hyphenated),
"colour"; code keeps `email`, `color`, `favorite`. Pronouns default to
they/them/their — including for seed Bob and Carol.

**Right-side button is committal.** `[Decline] [Accept]`, `[Cancel]
[Block]`, `[Not now] [Add to circle]`. Per `docs/ui.md`.

## Architecture

### Branches

```
main
 └─ 0800_invites_circles_ui          ← this plan's branch
     ├─ 0801_privacy_circle_blocked   ← merges back into 0800
     ├─ 0802_profile_sheet            ← merges back into 0800
     └─ 0803_invite_flow              ← merges back into 0800
```

### New plan directories (created by this plan's tasks)

- **`plans/0801_privacy_circle_blocked/`** — Privacy screen, Circle
  screen, Blocked screen, circle explainer sheet, the two DB triggers,
  and the `relationships.svelte.ts` state module.
- **`plans/0802_profile_sheet/`** — `<ProfileSheet>` with state-driven
  Add/Remove circle, Block/Unblock, Cancel-pending-invite. Includes a
  tiny migration adding the `invitations_delete` policy + DELETE
  grant so cancel-pending can be a direct table write.
- **`plans/0803_invite_flow/`** — Lists-screen banner, Invites inbox,
  post-accept prompt, invite picker sheet, Members screen, the two
  new list-overflow rows, and the `invitations.svelte.ts` state
  module.

### Cross-cutting Svelte conventions

Per `docs/frontend-layout.md`:

- New domain directories `web/src/lib/privacy/`, `web/src/lib/profile/`,
  `web/src/lib/invite/` each follow the standard
  `components/`, `state/`, `model/`, `__mocks__/` shape.
- Reactive state modules use the `.svelte.ts` suffix so runes
  compile.
- Mock components live in sibling `__mocks__/` directories, named
  exactly after the source file.
- Route-colocated tests drop the `+` prefix
  (`page.test.ts`, not `+page.test.ts`).

### Primitives reused (not rebuilt)

- `web/src/lib/basic/components/Sheet.svelte` — bottom-sheet modal
  with back-stack integration.
- `web/src/lib/shared/components/AppTopBar.svelte` — every new screen.
- `web/src/lib/shared/components/Avatar.svelte` — circle, blocked,
  inbox, picker, members rows + profile sheet.
- `web/src/lib/shared/components/Snackbar.svelte` — toasts.
- `web/src/lib/basic/components/Button.svelte`,
  `web/src/lib/basic/components/Icon.svelte` — buttons and icons
  across new screens.
- `web/src/lib/shared/http/postgrest.ts` — `pgGet` / `pgPost` /
  `pgPatch` / `pgDelete`.
- `web/src/lib/shared/state/back-stack.svelte.ts` —
  `pushHistoryGuard`, already integrated into `Sheet.svelte`.

### New DB migration

- **`db/migrations/0010_invite_cascades.sql`** (lands in 0801) —
  policy-cascade trigger on `user_settings` (R11) + 20-invite FIFO
  cap trigger on `invitations` (R12). Both as `SECURITY DEFINER`
  functions with `set search_path = public` per the schema convention.

### New DB migration (small)

- **`db/migrations/0011_invitations_delete.sql`** (lands in 0802) —
  `invitations_delete` policy (`USING (created_by = public.uid())`)
  + `GRANT DELETE ON public.invitations TO authenticated`. Pairs
  with the profile sheet's *Cancel pending invite* action.

### New DB tests

- **`db/tests/invite_cascades.sql`** (0801) — pgTAP for both triggers:
  policy-tighten declines all/non-circle invites, policy-loosen does
  not resurrect, FIFO cap is per-target.
- **`db/tests/invitations_delete.sql`** (0802) — pgTAP positive
  (inviter can delete own pending row) and negative (invitee cannot
  delete, third party cannot select-and-delete).

### Modified test catalogues

- `db/tests/schema_shape.sql` — assertions for the two new triggers
  and the new `invitations_delete` policy (split across 0801 and 0802).
- `db/tests/grants.sql` — DELETE grant for `invitations` (0802).

### Files modified (existing)

- `web/src/lib/settings/components/SettingsScreen.svelte` — *People*
  section with Invites + Privacy NavRows (0801 scaffolds the
  section; 0803 wires the Invites count badge).
- `web/src/lib/list/components/ListsScreen.svelte` — render
  `<InvitesBanner>` above the list rows (0803).
- `web/src/lib/list/components/ListOverflowSheet.svelte` — *Manage
  members* + *Leave list* rows (0803).
- `plans/0000_implementation_order.md` — tick step 8's checkbox and
  update the parenthetical from "(rename/edit/leave/delete/view-trash)"
  to "(rename/edit/members/view-trash/leave/delete)" so the documented
  ordering matches the shipped overflow (Phase 4).

## Phase structure

**Phase 0 — Doc reconciliation.** Two doc edits land on
`0800_invites_circles_ui` itself (not inside a sub-plan), before any
sub-branch is cut, so the sub-plan authors find the docs already in
the shape the plan assumes.

- `docs/invites.md` § "Pending-invite cap" (the paragraph that ends
  *"20 is tunable; the right number is 'high enough that no normal
  user ever notices.'"*) — extend with a sentence pinning the
  email-keyed carve-out: *"The cap applies to `target_user_id`-keyed
  pending invitations only; `target_email`-only rows (addressed to
  not-yet-registered users) are uncapped and convert to user-keyed
  rows at sign-up. Capping the email-keyed surface would let an
  attacker who knows an e-mail address evict that address's
  already-pending sign-up nudges by flooding adjacent typos."* This
  matches R12 and the trigger gate in TASKS Phase 1.
- `docs/invites.md` § "RLS and stored procedures" (the paragraph
  starting *"Insert and delete on `invitations`, …"*) — carve out
  the inviter-self cancel path: *"The one exception is the inviter's
  own *cancel pending invite* action, which is a direct
  `DELETE /invitations?id=eq.<uuid>` gated by the `invitations_delete`
  policy (`USING (created_by = public.uid())`); accept and decline
  by the invitee still go through RPCs."*
- `docs/data-model.md` § "What the app sees" — add a line under the
  `invitations` endpoint block: *"`DELETE /invitations?id=eq.<uuid>` —
  cancel a pending invite you created (inviter only; the
  `invitations_delete` RLS policy scopes the delete to your own
  rows)."*

The corresponding pgTAP coverage and the migration that creates
`invitations_delete` itself land in 0802 — Phase 0 only reconciles
the prose so the sub-plan's tests have a doc to point to.

**Phase 1 — 0801 (Privacy, Circle, Blocked + DB triggers).** Cut
`0801_privacy_circle_blocked` from `0800_invites_circles_ui`. Run
`/write-plan` to create its three plan files. Implement the Privacy /
Circle / Blocked screens + circle explainer sheet, the
`relationships.svelte.ts` state module, the new *People* section
scaffolding in SettingsScreen, and the
`0010_invite_cascades.sql` migration + pgTAP. Verify with
`./scripts/check.sh`. Merge back via `--no-ff`. Satisfies R1–R4, R11–R12,
R14 (Privacy NavRow), and R15 (relationships state half).

**Phase 2 — 0802 (Profile sheet + cancel-invite RLS).** Cut
`0802_profile_sheet` from the updated `0800_invites_circles_ui`. Run
`/write-plan` to create its three plan files. Implement
`<ProfileSheet>` with state-driven actions and the small
`0011_invitations_delete.sql` migration + pgTAP. The sheet ships as
a tested primitive with **no in-app consumer** until 0803's Members
screen wires it — Vitest covers each state variant (stranger,
in-circle, blocked, with-pending-invite, own-avatar bounce), and the
"one merge cycle of dormant code" cost is preferred over the
alternative of making 16 px overlapping avatars on the Lists overview
tappable (poor touch target, conflicts with the row's primary
list-navigation tap, opens a profile sheet on the wrong screen).
Verify with `./scripts/check.sh`. Merge back via `--no-ff`. Satisfies R5.

**Phase 3 — 0803 (Invite flow, members, overflow).** Cut
`0803_invite_flow` from the updated `0800_invites_circles_ui`. Run
`/write-plan` to create its three plan files. Implement the
`invitations.svelte.ts` state module, `<InvitesBanner>`, `/settings/invites`
route, post-accept circle prompt, `<InvitePickerSheet>`, Members
screen at `/lists/[list_id]/members`, the *Manage members* and *Leave
list* overflow rows, and the Settings *People* section's Invites
count badge. Add Playwright e2e specs `invites.spec.ts`,
`block.spec.ts`, `privacy.spec.ts`. Verify with
`./scripts/check.sh --e2e`. Merge back via `--no-ff`. Satisfies R6–R10,
R13 (anti-enumeration UX), and R15 (invitations state half).

**Phase 4 — Wrap up.** On `0800_invites_circles_ui`, run
`./scripts/check.sh --e2e` end-to-end. Update
`plans/0000_implementation_order.md`: tick step 8's checkbox and
adjust the overflow parenthetical. Commit
`chore(plan): tick step 8 in implementation order`. Merge
`0800_invites_circles_ui` into `main` via `--no-ff`.

Toolchain-coupling sweep: the only consumer→producer edge is
0803-imports-from-0801's `relationships.svelte.ts`, which lands
before 0803's branch is cut. 0802's `<ProfileSheet>` consumes the
same module. No SvelteKit `resolve()` calls reach a route created in
a later sub-plan because 0801's `/settings/privacy`,
`/settings/circles`, `/settings/blocked` exist before 0803 navigates
anywhere; 0803's `/settings/invites` and `/lists/[list_id]/members`
land together with their callers in the same sub-plan.

One soft edge survives: 0801's Settings *People* section scaffolds
the **Invites** NavRow with the placeholder sub-line *"No pending
invites"*, but the `/settings/invites` route doesn't exist until
0803. Rendering the NavRow as a real `<NavRow>` `href={"/settings/invites"}`
in 0801 would fail `svelte-check`'s typed-routes pass. The plan
chooses **option (a) — fold a stub** is *not* used here; instead
**option (c) — pre-pick** the escape: 0801 renders the Invites row
as a **non-interactive** `<div>` (no `<button>`, no `<a>`, no
`onclick`, `cursor: default`), styled identically to the live NavRow
but visually marked as inert (the placeholder sub-line carries the
"nothing to do" signal). 0803's final R14 task swaps the `<div>` for
the real `<NavRow href="/settings/invites">` in the same commit that
ships the route file, so the type-checker only ever sees a valid
combination.

## Reference docs and skills

- **`docs/invites.md`** — canonical UX spec: invite flow, policy /
  block checks, profile screen shape, anti-enumeration posture,
  policy-change-cascade deferral note (R11).
- **`docs/circles.md`** — circle model: one-directional, invisible,
  email-add mutual.
- **`docs/ui.md`** — TopBar styling, fixed-element positioning,
  empty-state patterns, button-pair convention (right = committal),
  back-stack pattern.
- **`docs/frontend-layout.md`** — tier rules (basic / shared /
  per-domain), filename conventions, `__mocks__/` placement, the
  route-test filename trap (no `+` prefix).
- **`docs/data-model.md`** — `list_members` self-leave PATCH
  endpoint (Leave-list row), trigger conventions.
- **`docs/testing.md`** — three test layers; pgTAP positive +
  negative coverage for every new policy or trigger.
- **`docs/quality.md`** — toolchain-coupling escape patterns
  (route-not-yet-created, etc.).
- **`design/cairn-invite-screens.jsx`** — visual spec for every
  step-8 screen. Each sub-plan's REQUIREMENTS must carry the exact
  copy and token values forward.
- **`design/cairn-screens.jsx`** — Members screen and the six-row
  List menu visual reference.
- **`design/cairn-ui.jsx`** — design tokens (`paper`, `paperAlt`,
  `ink`, `stone`, `stoneLt`, `rule`, `sage`, `ember`, `accent`).
- **`.claude/skills/writing-requirements.md`**,
  **`.claude/skills/writing-plan.md`**,
  **`.claude/skills/writing-tasks.md`** — format rules for each
  sub-plan's three files.

## Open questions

- **Should `<ProfileSheet>` show shared-list affiliation?** Doc says
  no in v1. We're following the doc. Reopen post-v1 once we have real
  usage.
- **Does PostgREST's `Prefer: resolution=merge-duplicates` reliably
  drive an `INSERT … ON CONFLICT DO UPDATE` on `relationships`?**
  0802's exploration phase will confirm; if not, the block-flip path
  uses a check-then-PATCH from `relationships.svelte.ts` instead.
  Either way, no new RPC is introduced.
