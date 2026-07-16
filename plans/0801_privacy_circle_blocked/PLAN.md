# Plan: Privacy + Circle + Blocked screens + invite-policy and FIFO triggers

The first sub-plan of step 8 (`0800_invites_circles_ui`). Lands the
settings-side invite-posture surfaces (Privacy, Circle, Blocked, the
circle explainer), the `relationships.svelte.ts` state module that
0802 and 0803 both consume, the _People_ section scaffold on
SettingsScreen, and the two DB triggers (`docs/invites.md` defers
policy-cascade and 20-invite FIFO cap to step 8). This is the slice
a user reaches first when shaping who can invite them — and it's the
foundation 0802's `<ProfileSheet>` and 0803's invite picker build on.

## Context

After step 7 (merged into `main`) the stack has the `relationships`
and `invitations` tables, all RLS, and the five RPCs. No app code
touches either table yet. `docs/invites.md` ends with two notes
saying "step 8 will add it" — the policy-cascade trigger that
removes pending invites when the policy tightens, and the 20-invite
FIFO cap. Step 8's UI work is split into three sub-plans
(`0801`, `0802`, `0803`); this is the first. Its consumers in later
sub-plans are: `0802_profile_sheet` (`<ProfileSheet>` reads
`circle` and `blocked` from this plan's state module to render its
status badge and pick its action rows), and `0803_invite_flow` (the
invite picker reads `circle` to render its _Your circle_ section,
and the cascade-feedback note on the Privacy screen reflects the
cascade trigger's footprint).

The web app has `web/src/lib/{auth,avatar,basic,item,list,settings,shared}`
domain folders today, with the `components` / `state` / `model` /
`__mocks__` shape documented in `docs/frontend-layout.md`. The
profile-chip, AppTopBar, Avatar, Sheet, Snackbar, and Icon
primitives are production-ready. `pgGet`/`pgPost`/`pgPatch`/`pgDelete`
HTTP wrappers exist in `web/src/lib/shared/http/postgrest.ts`.

The `t10_*` (per-table attribution), `t20_*` (modified*at bump),
and `t40*\_`(AFTER-trigger) slot convention is set in`docs/data-model.md`§ "Triggers"; this sub-plan slots into the`t30\_\_`(BEFORE-trigger, non-attribution) and`t40\_\*` rows for the
two new triggers.

## Decisions

**Cascade-feedback fetch lives in `user-settings.svelte.ts`, not in
the screen and not in `invitations.svelte.ts`.** The Privacy
screen's _"{N} pending invites have been declined…"_ note (R1)
reads the inbox count before and after a tighten-PATCH. The parent
plan's task 1.1 specified reading from
`invitations.svelte.ts.inbox.length`, which would force this
sub-plan to introduce a fragment of the invitations state module
just for the count. Instead the count-fetch / PATCH / count-fetch
sequence lives in `setInvitePolicy(next)` on a new
`web/src/lib/privacy/state/user-settings.svelte.ts` module (R10):
the surface is single-use (fires only on policy change), keeps
`invitations.svelte.ts` whole until 0803 lands its inbox UI, and
puts the HTTP boundary in one place rather than inside the
PrivacyScreen component. `setInvitePolicy` returns
`{ prevCount, newCount, tightened }` and the screen handles the
copy. The parent plan's task 1.1 mention of "reads `prevCount` from
`invitations.svelte.ts.inbox.length`" is treated as guidance on
_what_ the screen reads, not _where from_.

**Two screens, three routes — but new domain folder `privacy/`,
not `settings/`.** `web/src/lib/settings/` currently contains only
`SettingsScreen.svelte`; folding Privacy / Circle / Blocked into it
would mix a Settings-hub component with three distinct domain
features (privacy policy, circle relationships, blocked
relationships). Per `docs/frontend-layout.md` the privacy domain is
its own concept (touches the `user_settings.invite_policy` column
and the `relationships` table — not `user_settings.theme` or other
Settings-hub state), so a new `web/src/lib/privacy/` folder is
created. Routes live where SvelteKit demands them (under
`web/src/routes/(app)/settings/privacy`, `…/circles`, `…/blocked`);
the route files are one-line wrappers that import the screens from
`$lib/privacy/components/`.

**Build screens in reverse-dependency order to keep `svelte-check`
happy.** The Privacy screen NavRows resolve to `/settings/circles`
and `/settings/blocked`. The SettingsScreen Privacy NavRow resolves
to `/settings/privacy`. SvelteKit's `resolve()` (and the
`svelte/no-navigation-without-resolve` ESLint rule) rejects route
IDs that aren't in `web/src/routes/`. So the phase order is:
Blocked → Circle → Privacy → Settings _People_ section. Each
phase lands a route before any other code resolves to it. The
`<CircleExplainerSheet>` is imported by both Privacy and Circle, so
it lands before either of them. See `docs/quality.md` "Navigating
to a not-yet-created SvelteKit route" for the documented escape
pattern; this plan uses the **reorder** path, not the stub-fold or
per-line escape.

**Block uses upsert via `POST /relationships` with
`Prefer: resolution=merge-duplicates`.** The state module's `block`
needs to flip an existing `'circle'` row to `'blocked'` (or insert
a fresh `'blocked'` row if none exists). PostgREST's merge-duplicates
fires the `relationships_update` policy on the flip and
`relationships_insert` on the fresh row. Both policies are gated on
`user_id = public.uid()`, which is exactly the upsert's subject.
The Vitest test for the state module's `block` covers both paths
(fresh insert, flip from circle). If the runtime exploration in
this sub-plan's implementation reveals merge-duplicates doesn't
fire the right policy combo, fall back to a check-then-act sequence
in the state module (read first, then PATCH or POST) — record the
deviation in the task's Notes block.

**Trigger slot bindings follow the `docs/data-model.md`
convention.** Policy-cascade binds as `t40_apply_invite_policy_cascade`
on `user_settings` (parallel to `t40_block_declines_invitations` on
`relationships`). FIFO cap binds as `t30_enforce_fifo_cap` on
`invitations` (`t30_*` is the reserved future-BEFORE slot per
`docs/data-model.md:618`; `t10_*` is the per-table attribution
slot and isn't reused for a non-attribution BEFORE trigger).

**Two triggers, one migration file, split into two tasks.** The
two triggers serve different requirements (R7, R8) and have
independent pgTAP coverage, so each gets its own task. They share
`db/migrations/0010_invite_cascades.sql` because both are tightly
related to step-7 schema (the file shipped in step 7) and grouping
them into one migration matches the parent plan's
`db/migrations/0010_invite_cascades.sql` naming. Task 1.1 creates
the migration with the cascade trigger; task 1.2 appends the FIFO
trigger. Each task includes its own `schema_shape.sql` count
update.

**Non-interactive `<div>` stub for the Invites row.** The People
section's Invites row points at `/settings/invites`, which doesn't
exist until 0803. The three documented escapes are (a) reorder, (b)
fold a stub, (c) per-line escape. (a) is impossible — the route
file belongs in 0803 with its inbox component, not here. (b)
would mean shipping an empty `/settings/invites/+page.svelte` here,
which then 0803 has to overwrite (and the type-checker has to be
happy with the empty page in the meantime). (c) — per-line
`// eslint-disable` — adds noise and breaks intent. This plan
chooses a fourth path documented in `docs/quality.md`: render the
row as a `<div>` (no `<button>`, no `<a>`, no `onclick`,
`cursor: default`) styled identically to the live `.nav-row` block,
visually marked as inert via the _"No pending invites"_ sub-line
that carries the "nothing to do" signal. `svelte-check` sees no
route reference at all (no `goto`, no `href`), so there's nothing
to check. 0803's R14 task swaps the `<div>` for a real
`<button class="nav-row" onclick={() => goto(resolve('/settings/invites'))}>`
in the same commit that ships the `/settings/invites` route file.

**Loading state is gated on the state module's `loaded` flag.**
Every Privacy-domain screen reads from
`relationships.svelte.ts` and / or `user-settings.svelte.ts`, both
of which expose a reactive `loaded: boolean`. To avoid flash-of-
empty-state and falsely-zero count badges between mount and
fetch, the screens gate the relevant UI on `loaded === true`:
PrivacyScreen's segmented control renders indeterminate until
`userSettings.loaded`, its count badges are hidden until
`relationships.loaded`; CircleScreen's list section is hidden
until `relationships.loaded`; BlockedScreen's empty-state card is
gated the same way. The intro paragraph, top bar, and add-by-email
card render unconditionally — they're invariant to load state.

**State-module failures re-throw to the caller.** Both
`relationships.svelte.ts` and `user-settings.svelte.ts` follow the
re-throw pattern: a network or RLS error from any `pgGet` /
`pgPost` / `pgPatch` / `pgDelete` propagates as the underlying
`ApiError` without mutating the reactive state. Screens catch and
render a generic snackbar (_"Couldn't update privacy setting"_ on
PrivacyScreen; _"Couldn't add to circle"_ on CircleScreen's
`unknown` branch). Mutating reactive state before the HTTP succeeds
would leave the UI ahead of the server on failure; re-throwing
keeps reactive state and durable state in lock-step.

**State modules read the caller uid from `profile.svelte.ts`.**
All three new state modules (`relationships.svelte.ts`,
`user-settings.svelte.ts`, and any future privacy-domain state)
read the caller's uid via `$lib/shared/state/profile.svelte`'s
exported `profile.uid` rather than parsing the JWT or duplicating
the session lookup. The HTTP filter `user_id=eq.<my-uid>` is
technically redundant against RLS (which already scopes to the
caller), but PostgREST requires a query filter to scope the
result; the explicit filter keeps the call shape readable and
matches the convention in `web/src/lib/list/state/lists.svelte.ts`.

**No `<ProfileSheet>` consumer in this sub-plan.** The Circle and
Blocked screen rows don't tap-open a profile sheet here. The
Remove (Circle) and Unblock (Blocked) buttons are the only per-row
actions. This is deliberate: `<ProfileSheet>` lands in 0802; this
sub-plan doesn't fold a `<ProfileSheet>` stub or a tap handler
that would need rewiring once 0802 lands. A later refinement may
add the row-tap-opens-sheet wiring, but it's outside this plan's
scope.

## Architecture

### New files

- **`web/src/lib/privacy/components/PrivacyScreen.svelte`** (+ test) —
  R1 screen.
- **`web/src/lib/privacy/components/CircleScreen.svelte`** (+ test) —
  R2 screen.
- **`web/src/lib/privacy/components/BlockedScreen.svelte`** (+ test) —
  R3 screen.
- **`web/src/lib/privacy/components/CircleExplainerSheet.svelte`** (+ test) —
  R4 sheet; consumed by Privacy and Circle.
- **`web/src/lib/privacy/state/relationships.svelte.ts`** (+ test) —
  R6 reactive state module.
- **`web/src/lib/privacy/state/user-settings.svelte.ts`** (+ test) —
  R10 reactive state module owning `invitePolicy` and the
  cascade-feedback fetch sequence.
- **`web/src/lib/privacy/model/relationship.ts`** (+ test) —
  TypeScript types (`CircleEntry`, `BlockedEntry`, `RelationshipRow`)
  and the date-format helper (`addedAtLabel`, `blockedAtLabel`) used
  by Circle/Blocked rows.
- **`web/src/routes/(app)/settings/privacy/+page.svelte`** (+ `page.test.ts`) —
  one-line wrapper that imports and renders `<PrivacyScreen>`.
- **`web/src/routes/(app)/settings/circles/+page.svelte`** (+ `page.test.ts`)
  — same shape, `<CircleScreen>`.
- **`web/src/routes/(app)/settings/blocked/+page.svelte`** (+ `page.test.ts`)
  — same shape, `<BlockedScreen>`.
- **`db/migrations/0010_invite_cascades.sql`** — both new triggers
  (R7, R8), `SECURITY DEFINER` functions with `SET search_path =
public`.
- **`db/tests/invite_cascades.sql`** — pgTAP for both triggers, both
  positive and negative cases.

### Modified files

- **`web/src/lib/settings/components/SettingsScreen.svelte`** — adds
  the _People_ section (Invites non-interactive `<div>` stub +
  Privacy NavRow) above Appearance.
- **`web/src/lib/settings/components/SettingsScreen.test.ts`** —
  updated in the same task that adds the _People_ section.
- **`db/tests/schema_shape.sql`** — bump row-count assertions for
  the two new triggers (one extra row on `user_settings`, one
  extra row on `invitations`).

### New domain folder

```
web/src/lib/privacy/
├─ components/
│   ├─ BlockedScreen.svelte
│   ├─ BlockedScreen.test.ts
│   ├─ CircleExplainerSheet.svelte
│   ├─ CircleExplainerSheet.test.ts
│   ├─ CircleScreen.svelte
│   ├─ CircleScreen.test.ts
│   ├─ PrivacyScreen.svelte
│   └─ PrivacyScreen.test.ts
├─ model/
│   ├─ relationship.test.ts
│   └─ relationship.ts
└─ state/
    ├─ __mocks__/
    │   ├─ relationships.svelte.ts          ← test double for sibling consumers
    │   └─ user-settings.svelte.ts          ← test double for PrivacyScreen
    ├─ relationships.svelte.ts
    ├─ relationships.test.ts
    ├─ user-settings.svelte.ts
    └─ user-settings.test.ts
```

### Trigger ordering on `user_settings`

```
UPDATE public.user_settings SET invite_policy = 'circle';
  ├─ BEFORE row:  t05_set_timestamps       ← existing (0004_domain_schema.sql:518)
  │                  (freezes new.created_at/modified_at to OLD)
  ├─ BEFORE row:  t20_set_modified_at      ← existing (0004_domain_schema.sql:558)
  │                  (OF invite_policy — overwrites modified_at with clock_timestamp())
  ├─ row write
  └─ AFTER  row:  t40_apply_invite_policy_cascade  ← new (this plan)
                    (deletes non-matching pending invitations)
```

### Trigger ordering on `invitations`

```
INSERT INTO public.invitations (target_user_id, ...) VALUES (...);
  ├─ BEFORE row:  t05_set_timestamps       ← existing (0009_invitations.sql:60)
  ├─ BEFORE row:  t10_set_attribution_*    ← existing
  ├─ BEFORE row:  t30_enforce_fifo_cap     ← new (this plan)
  │                  (deletes oldest pending if count >= 20)
  ├─ row write
  └─ AFTER  row:  t40_block_declines_invitations  ← existing (0009_invitations.sql:322)
```

## Phase structure

**TDD ordering.** Each task that produces testable logic puts RED
(failing test) steps before GREEN (implementation) steps in the same
task. RED and GREEN of a single piece of logic are never split
across tasks — a commit that ends in failing tests is broken code
(see `.claude/skills/writing-tasks.md` "Right-sized"). Phase-level
ordering: doc reconciliation (parent Phase 0 absorbed) → DB triggers
(load-bearing) → state modules (depended on by every screen) →
primitives (CircleExplainerSheet) → screens (in route-dependency
order) → Settings _People_ section.

**Phase 0 — Doc reconciliation (absorbed from the parent plan).**
The parent plan's TASKS 0.1 specified four doc edits that needed to
land on `0800_invites_circles_ui` before any sub-branch was cut, so
each sub-plan could find the docs in their post-reconciliation
state. That commit didn't happen before `0801_privacy_circle_blocked`
was branched off, so 0801 absorbs the same five paragraph edits as
its own Phase 0. This sub-plan's R7/R8 pgTAP assertions and R2/R3
copy assertions reference the post-reconciliation prose, so the doc
fix has to land before any other 0801 task.

**Phase 1 — DB triggers (R7, R8).** Two tasks, both red-before-green
in the same task.

1.1 Policy-cascade trigger (R7). RED: write
`db/tests/invite_cascades.sql` with three positive transitions and
the loosen-no-resurrection negative case. GREEN: create
`db/migrations/0010_invite_cascades.sql` with the
`tg_apply_invite_policy_cascade` function and the
`t40_apply_invite_policy_cascade` binding on `user_settings`. Bump
`db/tests/schema_shape.sql`.

1.2 FIFO cap trigger (R8). RED: extend
`db/tests/invite_cascades.sql` with the 1→20-uncapped, 21st-evicts,
unrelated-target-untouched, and email-keyed-uncapped cases. GREEN:
append the `tg_enforce_fifo_cap_invitations` function and the
`t30_enforce_fifo_cap` binding to
`db/migrations/0010_invite_cascades.sql`. Bump
`db/tests/schema_shape.sql`.

**Phase 2 — Relationships state module (R6).**

2.1 `web/src/lib/privacy/model/relationship.ts` (types +
date-format helper) + co-located Vitest. RED first.

2.2 `web/src/lib/privacy/state/relationships.svelte.ts` + Vitest.
Tests cover every method: `loadRelationships` populates from
`relationships` GET; `addCircleByEmail` maps the
`'no such user'` raise to
`{ok: false, reason: 'no-such-user'}` and the `'cannot add
yourself'` raise to `{ok: false, reason: 'self'}`;
`addCircleById` appends to `circle`; `removeFromCircle` deletes
and removes; `block` upserts and moves from `circle` to `blocked`
if present; `unblock` deletes the row outright (does not restore
prior `'circle'`).

2.3 `web/src/lib/privacy/state/user-settings.svelte.ts` + Vitest.
Exposes `invitePolicy`, `loaded`, `loadUserSettings()`, and
`setInvitePolicy(next): Promise<{prevCount, newCount, tightened}>`.
Vitest covers the load path, the three-step sequence inside
`setInvitePolicy`, and the `tightened` boolean across every
policy transition (tighten / loosen / same).

**Phase 3 — Circle explainer sheet (R4).**

3.1 `<CircleExplainerSheet>` + Vitest. The sheet has no upstream
dependencies — it sits at the top of the import graph for both
Privacy and Circle. Tests assert the title, the four explainer
points (verbatim copy), the privacy footer, and the _Got it_
button dismisses via the `Sheet.svelte` back-stack pattern.

**Phase 4 — Blocked screen (R3).**

4.1 `<BlockedScreen>` + Vitest + route + `page.test.ts`. No
outgoing NavRows to other Privacy-domain routes, so this phase
lands first among the screens. Tests cover the empty state, the
populated row format with the `"blocked DD MMM"` sub-line, and the
Unblock button calling `unblock` from the state module.

**Phase 5 — Circle screen (R2).**

5.1 `<CircleScreen>` + Vitest + route + `page.test.ts`. Imports
`<CircleExplainerSheet>` (now exists). Tests cover the intro
paragraph, the _What's this?_ link opening the sheet, the
populated row format with the `"added DD MMM"` sub-line, the
Remove button calling `removeFromCircle`, the add-by-email form
calling `addCircleByEmail`, and the `'no such user'` raise
surfacing the helpful error copy.

**Phase 6 — Privacy screen (R1).**

6.1 `<PrivacyScreen>` + Vitest + route + `page.test.ts`. Imports
`<CircleExplainerSheet>` and resolves `/settings/circles` and
`/settings/blocked` in its NavRows — both now exist. Tests cover
the segmented control PATCHing `user_settings.invite_policy`, the
_What's a circle?_ link visible only when `circle` selected and
opening the sheet, the two NavRows (with counts read from the
state module), and the cascade-feedback note (singular form when
`removed == 1`; suppressed on `removed == 0`; suppressed on a
loosen).

**Phase 7 — Settings _People_ section (R5).**

7.1 Add _People_ section above Appearance in `SettingsScreen.svelte`:
non-interactive `<div>` Invites row + live Privacy NavRow.
`SettingsScreen.test.ts` is updated in the same task — assertions
for placement (between profile chip and Appearance), the two rows'
copy, the Invites row's non-interactive shape, and the Privacy
row's navigation to `/settings/privacy`.

## Reference docs and skills

- **`docs/invites.md`** — canonical UX spec: policy-cascade and
  FIFO cap deferral notes, anti-enumeration posture (relevant to
  R2's `'no such user'` carve-out), "Block always wins" rule for
  R3 unblock.
- **`docs/circles.md`** — circle model: one-directional, invisible,
  email-add mutual.
- **`docs/ui.md`** — segmented control, NavRow styling, dashed-card
  pattern for add-by-email form, button-pair convention (right =
  committal), dates format (`DD MMM` / `DD MMM YYYY`), TopBar
  styling.
- **`docs/data-model.md`** — trigger slot convention (`t10_*` /
  `t20_*` / `t30_*` / `t40_*`), `invite_policy` column definition,
  RLS policies on `relationships`.
- **`docs/frontend-layout.md`** — tier rules (`basic/` / `shared/` /
  per-domain), filename conventions (route-test drops `+`),
  `__mocks__/` placement.
- **`docs/testing.md`** — three test layers; pgTAP positive +
  negative coverage for every new trigger.
- **`docs/quality.md`** — toolchain-coupling escape patterns
  (route-not-yet-created; this plan uses reorder for the
  Privacy → Circle/Blocked dependency and the non-interactive
  `<div>` for the Settings Invites stub).
- **`design/cairn-invite-screens.jsx`** — visual spec for Privacy,
  Circle, Blocked, and CircleExplainerSheet. Each screen's task
  cites the section by name.
- **`design/cairn-screens.jsx:1135-1143`** — SettingsScreen
  _People_ section placement reference.
- **`.claude/skills/writing-tasks.md`** — TDD ordering, self-
  contained tasks, no `+` in route-test filenames.
- **`.claude/skills/writing-sql.md`** — `SECURITY DEFINER` +
  `SET search_path = public` convention for trigger functions.
- **`.claude/skills/writing-tests.md`** — pgTAP positive +
  negative; Vitest asserts user-visible behaviour.

## Open questions

- **Does `Prefer: resolution=merge-duplicates` reliably fire
  `relationships_update` on the flip path?** Resolved at task 2.2
  implementation; the Vitest covers both paths and the deviation
  (fall back to check-then-PATCH) is recorded in the task's Notes
  if needed.
- **Does PostgREST `HEAD` with `Prefer: count=exact` work against
  `invitations` with RLS in play?** Resolved at task 6.1
  implementation. If not, the Privacy screen issues a regular
  `GET /invitations?…&select=id` and counts the array length.
  Either way no schema change is needed.
