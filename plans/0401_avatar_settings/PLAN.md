# Plan: Avatar component + Settings screen

Sub-step 0401. Avatar is a shared visual primitive; Settings is the first
product screen and is self-contained (no new DB, no new routes beyond its own).
Both land before the list/item screens so those screens inherit Avatar without
retrofitting.

## Context

Steps 1–3 are merged. `preferences.svelte.ts` already stores theme and font
size in `localStorage` and applies them to the document — but has no UI.
`session.svelte.ts` exposes `signOut()` — but the only call site is a
temporary button on the placeholder `+page.svelte`. The design primitives
(`Button`, `TopBar`, `Icon`, `Sheet`) are all in place.

The root `+layout.svelte` already guards every non-public route: a signed-out
user on any path outside `PUBLIC_AUTH_PATHS` is redirected to `/auth/login`.
No additional guard is needed in the `(app)` layout for now; the group is
created here as an organisational home for all product screens.

## Decisions

**`Avatar` in `shared/components/`, not in an `avatar/` domain.**
The `avatar/` domain (step 5) is about the photo-upload sidecar, upload UI,
and the `bump_avatar_version` RPC — it's a heavy slice. The display component
(`Avatar.svelte`) is a lightweight visual primitive used across Settings,
Items attribution, per-member vote panels, and eventually any screen that
shows a user face. It belongs in `shared/`, where `TopBar`, `Snackbar`, etc.
live — not locked inside the domain that happens to manage uploads.

**Deterministic hue via simple character hash.** The colour of each user's
disc must be stable across sessions and renders without a DB column.
A djb2-style accumulation over the UTF-16 char codes, then `% 360`, gives
a uniform-ish spread and zero runtime cost. The OKLCH colour space
(`oklch(70% 0.10 <hue>deg)`) produces perceptually even colours — all hues
look similar in lightness, unlike HSL where certain hues look washed-out.

**Profile store in `shared/state/`, not `settings/state/`.**
`display_name` will be needed by the Items screen (attribution line) and any
future screen that shows the current user. Putting it in `settings/state/`
would require a cross-domain import or a redundant fetch in every consumer.
`shared/state/` is the correct home for cross-cutting session-derived data.

**Settings screen defers all rows beyond Appearance + Sign Out.** Rows for
Invites, Privacy, Recovery, Export, About, and Delete account each belong to
a specific later step. Rendering them as disabled stubs now creates dead UI
and tempts a future step to treat them as already there. Absence is cleaner
than a grey stub.

**`(app)/+layout.svelte` is a pass-through for now.** The root layout
already guards all non-public routes. The `(app)` group is an organisational
move; inserting a duplicate guard here would just create two code paths to
keep in sync. 0402 can add real per-group logic if it turns out to be needed.

## Architecture

### New files

- **`web/src/lib/shared/components/Avatar.svelte`** — initials-disc component.
- **`web/src/lib/shared/components/Avatar.test.ts`** — Vitest tests: initials derivation, colour stability, size prop.
- **`web/src/lib/shared/components/__mocks__/Avatar.svelte`** — mock for component tests that use Avatar downstream.
- **`web/src/lib/shared/state/profile.svelte.ts`** — `profile` reactive object with `displayName: string | null`.
- **`web/src/lib/shared/state/profile.test.ts`** — Vitest tests with MSW: signs-in → fetches display_name, reset on sign-out.
- **`web/src/lib/shared/state/__mocks__/profile.svelte.ts`** — mock exposing a writable `displayName`.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — Settings UI.
- **`web/src/lib/settings/components/SettingsScreen.test.ts`** — Vitest tests: sign-out, theme button, font-size button.
- **`web/src/routes/(app)/+layout.svelte`** — pass-through layout for product route group.
- **`web/src/routes/(app)/settings/+page.svelte`** — thin page wrapper, renders `SettingsScreen`.
- **`web/src/routes/(app)/settings/page.test.ts`** — smoke: page renders SettingsScreen.

### Modified files

- **`web/src/routes/+page.svelte`** — remove Sign Out button and its comment block; update placeholder text.
- **`web/e2e/auth.spec.ts`** — navigate to `/settings` before clicking `[data-test=signout]`.

## Phase structure

1. **Phase 1 — Avatar component.** Write the Vitest tests for initials
   derivation and colour determinism (RED), then implement `Avatar.svelte` and
   its `__mocks__` (GREEN). See Tasks 1.1.

2. **Phase 2 — Profile store.** Write Vitest tests with an MSW handler for
   `GET /api/profiles` (RED), then implement `profile.svelte.ts` (GREEN).
   Add the `__mocks__` file. See Task 2.1.

3. **Phase 3 — Settings screen + route.** Write Vitest tests for
   `SettingsScreen` (RED), implement the component (GREEN). Then create the
   `(app)` route group, the Settings page wrapper, update `+page.svelte`, and
   update the Playwright spec. See Tasks 3.1–3.2.

## Reference docs and skills

- **`docs/frontend-layout.md`** — lib tier split; `shared/` vs domain; `__mocks__` convention; filename rules (no `+` in test names next to route files).
- **`docs/testing.md`** — three-layer test pyramid; Vitest component testing rules.
- **`.claude/skills/writing-tests.md`** — `render` helper, `getByDataTest`, MSW handler pattern, `__mocks__` shape.
- **`web/src/lib/shared/state/preferences.svelte.ts`** — existing store the Appearance controls write to.
- **`web/src/lib/shared/state/session.svelte.ts`** — `signOut()` and `session` shape.
- **`web/src/lib/shared/http/postgrest.ts`** — `pgGet` used by the profile store.
