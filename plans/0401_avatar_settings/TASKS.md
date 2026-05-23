# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tests.md`** — `render` helper, `getByDataTest`, MSW handler pattern, `__mocks__` shape.
- **`docs/frontend-layout.md`** — lib tier split; `shared/` vs domain; `__mocks__` convention; no `+` prefix on route test files.
- **`web/src/lib/shared/state/preferences.svelte.ts`** — existing store; Appearance controls write `preferences.theme` and `preferences.fontSize`.
- **`web/src/lib/shared/state/session.svelte.ts`** — `signOut()`, `session.current.user.id` (available when status is `'signed-in'`).
- **`web/src/lib/shared/http/postgrest.ts`** — `pgGet<T>(path)` used by the profile store.
- **`web/src/lib/test/render.ts`** — the `render` helper all Vitest component tests use.
- **`web/src/lib/test/handlers.ts`** — MSW handler registry; new handlers are added here.

---

## Phase 1 — Avatar component

### [ ] 1.1 Create `Avatar.svelte` with initials-disc and deterministic colour

**Created:** 2026-05-23T07:57:40Z
**Completed:**

**Why:** `Avatar` is used in the Settings profile chip (task 3.1) and later in
item attribution (0403). It must land first so downstream tasks can import it
rather than stub it.

**Prerequisites:** None — no prior task needed.

**Decisions:**
- Lives at `web/src/lib/shared/components/Avatar.svelte` — it's a cross-domain
  display primitive (Settings, Items, future screens all use it), so `shared/`
  is correct, not a per-domain folder.
- Props: `displayName: string`, `size?: number` (default 40), `data-test?: string`.
- **Initials:** split `displayName` on whitespace; take `words[0][0]` and, if
  more than one word, `words[words.length-1][0]`; uppercase both. If the name
  is empty or whitespace-only, render `?`.
- **Colour:** djb2-style hash of the name's UTF-16 char codes:
  ```ts
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  ```
  Apply as `background: oklch(70% 0.10 ${hue}deg)`. White text (`color: #fff`).
- Inline styles for the circle shape: `border-radius: 50%`, `width: ${size}px`,
  `height: ${size}px`, `font-size: ${size * 0.46}px`, `font-weight: 600`.
- Uses the `data-test` prop on the outer `<span>` for testability.
- A `__mocks__/Avatar.svelte` ships at the same time — it renders a `<span>`
  with `data-test` and the `displayName` as text content so downstream tests
  can assert which name was passed.

**Files:**
- `web/src/lib/shared/components/Avatar.svelte` (create)
- `web/src/lib/shared/components/Avatar.test.ts` (create)
- `web/src/lib/shared/components/__mocks__/Avatar.svelte` (create)

**Steps:**
1. RED — Create `Avatar.test.ts` with `plan`:
   - Single-word name → one initial (e.g. `'Alice'` → `'A'`).
   - Two-word name → two initials (e.g. `'Alice Wonderland'` → `'AW'`).
   - Three-word name → first + last initial (e.g. `'Mary Jane Watson'` → `'MW'`).
   - Empty string → `'?'`.
   - Same name rendered twice → same `background` style string (colour stability).
   - `size` prop controls `width` and `height` inline style.
2. RED — Run `pnpm test` in `web/`; confirm the new tests fail (component doesn't exist yet).
3. GREEN — Create `Avatar.svelte` implementing the initials and colour logic per Decisions.
4. GREEN — Create `__mocks__/Avatar.svelte` (renders `<span data-test={rest['data-test']}>{displayName}</span>`).
5. GREEN — Run `pnpm test`; confirm all new tests pass.

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint` (all run from `web/`)

---

## Phase 2 — Profile store

### [ ] 2.1 Create `profile.svelte.ts` reactive store

**Created:** 2026-05-23T07:57:40Z
**Completed:**

**Why:** The Settings screen needs `display_name` for the profile chip. The
Items screen (0403) will need it for attribution. Centralising the fetch in
`shared/state/` avoids duplicate fetches and cross-domain imports.

**Prerequisites:** None — no dependency on task 1.1.

**Decisions:**
- Module: `web/src/lib/shared/state/profile.svelte.ts`.
- Exports `profile` as a `$state` object: `{ displayName: string | null }`.
  Starts as `{ displayName: null }`.
- Uses `$effect.root(() => { $effect(() => { ... }) })` watching
  `session.current.status`. When status becomes `'signed-in'`, fetches
  `GET /profiles?id=eq.<uid>&select=display_name` (with
  `Accept: application/vnd.pgrst.object+json` so PostgREST returns a single
  object, not an array). Sets `profile.displayName` on success. On sign-out,
  resets to `null`.
- Uses `pgGet<{ display_name: string }>` from `$lib/shared/http/postgrest`,
  with an explicit `Accept` header for the single-object response:
  ```ts
  pgGet<{ display_name: string }>(
    '/profiles?id=eq.' + uid + '&select=display_name',
    { headers: { Accept: 'application/vnd.pgrst.object+json' } }
  )
  ```
  Without this header the default `Accept: application/json` makes PostgREST
  return an array, and `result.display_name` would be `undefined` at runtime.
- On `pgGet` failure (any thrown error), log with `console.error` and leave
  `profile.displayName` as `null` — consistent with `session.svelte.ts`'s
  error handling.
- Does **not** import from `$lib/auth/` — uses `session` from
  `$lib/shared/state/session.svelte` only (consistent with the
  `shared/ ← basic/` import rule in `docs/frontend-layout.md`).
- Mock at `__mocks__/profile.svelte.ts` exports a plain `$state` object
  so test files can write `profile.displayName = 'Alice'` to control state.
- MSW handler for `GET /api/profiles` must be added to `web/src/lib/test/handlers.ts`.

**Files:**
- `web/src/lib/shared/state/profile.svelte.ts` (create)
- `web/src/lib/shared/state/profile.test.ts` (create)
- `web/src/lib/shared/state/__mocks__/profile.svelte.ts` (create)
- `web/src/lib/test/handlers.ts` (modify — add profiles GET handler)

**Steps:**
1. RED — Add an MSW handler in `handlers.ts` for `GET /api/profiles` (path only,
   no query-string in the pattern) returning `{ display_name: 'Alice' }`.
   Use the path-only pattern — URLPattern query-string wildcard behaviour in
   MSW v2 is unreliable and the actual `pgGet` call may emit params in a
   different order than the pattern specifies.
2. RED — Create `profile.test.ts`. Each test must call `await tick()` (from
   `'svelte'`) after every session transition to flush the `$effect` before
   asserting — without it, assertions read the stale pre-effect value.
   - When session is set to `signed-in` with the known test UID and `await tick()`
     is called → `profile.displayName` becomes `'Alice'`.
   - When session is independently set to `signed-in`, `await tick()` called to
     confirm `displayName` is `'Alice'`, then set to `signed-out` and `await tick()`
     called again → `profile.displayName` resets to `null`. (Set up the signed-in
     state inside this test itself — do not rely on the first test's side-effects,
     because test ordering may vary.)
3. RED — Run `pnpm test`; confirm new tests fail.
4. GREEN — Create `profile.svelte.ts` per Decisions.
5. GREEN — Create `__mocks__/profile.svelte.ts`.
6. GREEN — Run `pnpm test`; confirm green.

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint`

---

## Phase 3 — Settings screen + route

### [ ] 3.1 Create `SettingsScreen` component

**Created:** 2026-05-23T07:57:40Z
**Completed:**

**Why:** The Settings screen is the first product screen. It gives the
existing `preferences` store a real UI and moves Sign Out to its permanent
home.

**Prerequisites:** Task 1.1 (`Avatar` + mock exist). Task 2.1 (`profile` mock
exists). Mocks for `preferences.svelte.ts` and `session.svelte.ts` already
exist at `__mocks__/`.

**Decisions:**
- Component at `web/src/lib/settings/components/SettingsScreen.svelte`.
- Uses `TopBar` with `showBack={false}` and title "Settings" (it's a
  top-level screen — no back arrow).
- **Profile chip:** two states:
  - When `profile.displayName` is `null` (loading): render a `<div
    data-test="profile-chip-skeleton">` containing a circle placeholder
    (44 × 44 px, `border-radius: 50%`) and a short rectangle, both
    with a CSS `@keyframes` shimmer animation (grey background sliding
    highlight). Avatar is **not** rendered in this state.
  - When `profile.displayName` is a string: render `Avatar` (size 44) +
    the display name text. No tap target.
- **Theme buttons:** three `Button` elements labelled "Light", "Dark",
  "System" with `data-test="theme-light"`, `"theme-dark"`, `"theme-system"`.
  Active button gets `variant="primary"`, inactive get `variant="ghost"`.
  Clicking sets `preferences.theme`.
- **Font size buttons:** five `Button` elements labelled "XS", "S", "M",
  "L", "XL" with `data-test="fontsize-xs"`, `"fontsize-s"`, `"fontsize-m"`,
  `"fontsize-l"`, `"fontsize-xl"`. Same active/inactive pattern. Clicking
  sets `preferences.fontSize`.
- **Sign Out:** `Button` variant `"ghost"`, `data-test="signout"`, calls
  `signOut()` on click. `data-test` value and `variant` must match the
  temporary button in `+page.svelte` so the existing Playwright spec keeps
  working after the migration in task 3.2.
- Test mocks: `vi.mock('$lib/shared/components/Avatar.svelte')`,
  `vi.mock('$lib/shared/state/profile.svelte')`,
  `vi.mock('$lib/shared/state/preferences.svelte')`,
  `vi.mock('$lib/shared/state/session.svelte')`.

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (create)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (create)

**Steps:**
1. RED — Create `SettingsScreen.test.ts`:
   - Sign Out button is present with `data-test="signout"`.
   - Clicking Sign Out calls `signOut()`.
   - Active theme button matches `preferences.theme` (mock it to `'dark'`;
     assert the "Dark" button has `variant="primary"`).
   - Active font size button matches `preferences.fontSize`.
   - Clicking a theme button updates `preferences.theme`.
   - Clicking a font size button updates `preferences.fontSize`.
   - Profile chip renders the display name from the mock `profile`.
   - When `profile.displayName` is `null`, `data-test="profile-chip-skeleton"`
     is present and Avatar is not rendered (the mock Avatar's element is
     absent).
2. RED — Run `pnpm test`; confirm the new tests fail.
3. GREEN — Create `SettingsScreen.svelte` per Decisions.
4. GREEN — Run `pnpm test`; confirm green.

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint`

### [ ] 3.2 Wire the route, update placeholder, update Playwright spec

**Created:** 2026-05-23T07:57:40Z
**Completed:**

**Why:** Makes Settings reachable at `/settings`, removes Sign Out from the
placeholder home, and updates the Playwright auth spec so it still tests
sign-out after the button moves.

**Prerequisites:** Task 3.1 (`SettingsScreen.svelte` exists).

**Decisions:**
- `src/routes/(app)/+layout.svelte` — minimal: just `<script>` importing
  `Snippet` type and `{@render children()}`. No guard logic — the root layout
  already redirects unauthenticated users. SvelteKit route groups do not
  require a layout; the file is created as an organisational anchor so 0402
  has a clear place to add guard logic if needed.
- `src/routes/(app)/settings/+page.svelte` — imports and renders
  `SettingsScreen`. No other logic.
- `src/routes/+page.svelte` — remove the Sign Out `<Button>` and its comment
  block. Update the placeholder `<p>` to reflect that Sign Out is now in
  Settings.
- `web/e2e/auth.spec.ts` — in the sign-out test step, add
  `await page.goto('/settings')` before `page.click('[data-test=signout]')`.
- Route-test filename rule: the test next to `+page.svelte` is named
  `page.test.ts` (no `+` prefix), per `docs/frontend-layout.md`.

**Files:**
- `web/src/routes/(app)/+layout.svelte` (create)
- `web/src/routes/(app)/settings/+page.svelte` (create)
- `web/src/routes/(app)/settings/page.test.ts` (create — smoke test: page renders)
- `web/src/routes/+page.svelte` (modify — remove Sign Out)
- `web/e2e/auth.spec.ts` (modify — navigate to /settings before sign-out click)

**Steps:**
1. Create `src/routes/(app)/+layout.svelte` with `{@render children()}`.
2. Create `src/routes/(app)/settings/+page.svelte` importing `SettingsScreen`.
3. Create `src/routes/(app)/settings/page.test.ts` with a smoke test (renders
   without throwing, contains `data-test="signout"`).
4. Update `src/routes/+page.svelte`: remove the `<Button>` Sign Out block and
   its `<!-- TEMPORARY: ... -->` comment. Update the `<p>` placeholder text.
5. Update `web/e2e/auth.spec.ts`: in the sign-out step, navigate to
   `/settings` first.
6. Run `pnpm test` — all Vitest tests green.
7. Run `./scripts/check.sh` — green.

**Verify:** `./scripts/check.sh` · `pnpm exec playwright test web/e2e/auth.spec.ts`
