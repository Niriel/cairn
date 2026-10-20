# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — TDD ordering, self-contained tasks.
- **`.claude/skills/writing-tests.md`** — created in Task 0.2; the rules for every `*.test.ts` in this plan.
- **`docs/frontend-layout.md`** — created in Task 0.1; canonical source for the per-domain layout, three-tier split, filename rules, mock placement.
- **`docs/ui.md`** — safe-areas (119–135), back-stack pattern (137–153), font-size scale (163–166), device-local theme (161–168).
- **`docs/testing.md`** — three-layer pyramid (pgTAP / Vitest / Playwright).
- **`docs/architecture.md`** — SvelteKit static bundle, no Tailwind, self-hosted everything.
- **`design/cairn-ui.jsx`** — token tables (3–33), icon paths (71+), CairnGlyph/Wordmark SVGs (38–67). Source-of-truth for the visual layer.

## Phase 0 — Docs & conventions

These land **before** any code. Downstream tasks reference these docs from their `Reference:` lines; landing them first means the convention is canonical, not retrofitted.

### [x] 0.1 Create `docs/frontend-layout.md` and update CLAUDE.md

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:35:56Z

**Why:** Every later domain (auth, list, avatar, settings, …) needs one canonical doc for the per-domain layout, three-tier split, filename rules, and mock placement. Without it, parallel sessions diverge.

**Prerequisites:** None.

**Decisions:**

- Doc sits sibling to `docs/architecture.md`, `docs/ui.md`, `docs/data-model.md`.
- Sections, in order:
  1. **Where things live.** Three tiers: `basic/` (framework-agnostic primitives, no Cairn-domain knowledge — Button, Icon, Sheet, Fab); `shared/` (Cairn-aware cross-cutting — TopBar, Snackbar, theme state, back-stack); per-domain folders (`auth/`, `list/`, `avatar/`, …). A domain may import from `basic/` and `shared/` but never from a sibling domain.
  2. **Domain folder shape.** `<domain>/components/` (Svelte components), `<domain>/state/` (`.svelte.ts` runes modules), `<domain>/model/` (non-reactive TS — types, helpers, validators). `views/` reserved for page-level components and usually omitted because SvelteKit routes live in `src/routes/`.
  3. **Filename conventions.** `PascalCase.svelte` for components, `kebab-case.svelte.ts` for runes modules, `kebab-case.ts` for plain modules. Tests next to source as `<Name>.test.ts`. Mocks under `__mocks__/<exact-source-filename>`.
  4. **Mocks (hybrid).** Vitest automock: `vi.mock('$lib/path/Foo.svelte')` without a factory picks up `__mocks__/Foo.svelte` next to the source. A `__mocks__/<name>` file is **required** for any source mocked from more than one test. Inline `vi.mock(path, factory)` is allowed for one-offs.
  5. **Testing rules.** One-paragraph summary that defers to the Cairn testing skill (Task 0.2).
  6. **Adding a new domain — worked example.** Walk through `lib/circles/` from empty: which subfolders to create (`components/`, `state/`), where the first test goes, where its mock goes if needed.
- CLAUDE.md edit: insert `docs/frontend-layout.md` into the **Read first** ordered list as a new entry between current item 3 (`docs/data-model.md`) and item 4 (`docs/testing.md`). Renumber subsequent items.

**Files:**

- `docs/frontend-layout.md` (create)
- `CLAUDE.md` (modify)

**Steps:**

1. Write `docs/frontend-layout.md` (~150 lines, prose with the example directory tree). No code beyond a directory-tree fence and a `vi.mock(...)` snippet showing automock.
2. Edit `CLAUDE.md` **Read first** ordered list — insert the new entry; renumber 4 → 5, 5 → 6, 6 → 7.
3. Verify both files render correctly (open them, eyeball the headings).

**Verify:** `git diff --stat` shows two files modified · `grep -nE 'frontend-layout' CLAUDE.md` finds the new entry.

### [x] 0.2 Create the `writing-tests` skill and cross-reference from `docs/testing.md`

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:37:56Z

**Why:** Cherry-picked testing rules (data-test attributes, no shared `beforeEach`, hybrid `__mocks__/`, MSW at network) need to fire whenever a session writes tests. A skill triggers contextually; a doc is read once. Defers to `docs/testing.md` for the layer split rather than duplicating it.

**Prerequisites:** None (parallel to 0.1).

**Decisions:**

- Path: `.claude/skills/writing-tests.md`. The project's `.claude/skills/` already holds the `writing-*.md` family (`writing-plan.md`, `writing-requirements.md`, `writing-tasks.md`, `writing-sql.md`); the new file is a sibling. Do **not** put it in `.claude/commands/` — that directory is for slash commands like `/work`, `/write-plan`, `/concerns`, which are a different invocation contract.
- Skill name: `writing-tests.md`. Body ~60 lines:
  - **DOM queries** via `data-test="…"` only. Helper at `web/src/lib/test/render.ts` (`getByDataTest`, `queryByDataTest`).
  - **Mocks**: prefer co-located `__mocks__/<exact-source-filename>` over inline factories when the source is mocked from more than one test. Vitest automock picks them up via bare `vi.mock(path)`.
  - **Mocks use Svelte 5 runes idiom.** Components in this codebase render children via `let { children, ...rest } = $props()` + `{@render children?.()}`. Mock files must follow the same form — never `<slot />` (legacy Svelte 4 syntax, allowed in compat mode but inconsistent with the runes posture every existing component uses).
  - **No shared `beforeEach`** at file or suite scope. Each test sets up its own mocks (`vi.spyOn(...)` + `mockReturnValue` per-test). Exception: harness-lifecycle cleanups in `vitest.setup.ts` (RTL `cleanup()`, MSW `resetHandlers()`) are allowed because they aren't shared _mock state_.
  - **HTTP at the network layer** via MSW (`web/src/lib/test/handlers.ts`). No fake API wrapper.
  - **What tests assert**: props in, events / rendered output / state changes out. Not internals.
  - **Deferred** (link to `docs/open-questions.md`): the three-layer mock aggregator (`tests/mocks/lists/`) and a hard coverage gate.
- `docs/testing.md` cross-reference: one paragraph appended to its Vitest section, pointing readers at `docs/frontend-layout.md` (layout) and the new skill (rules).

**Files:**

- `.claude/skills/writing-tests.md` (create)
- `docs/testing.md` (modify)

**Steps:**

1. Write `.claude/skills/writing-tests.md` per Decisions.
2. Open `docs/testing.md`, locate the Vitest section (search for "Vitest"), append the cross-reference paragraph at the end of that section.

**Verify:** `ls .claude/skills/writing-tests.md` succeeds · `grep -nE 'writing-tests|frontend-layout' docs/testing.md` finds the cross-reference.

### [x] 0.3 Log deferred decisions in `docs/open-questions.md`

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:39:17Z

**Notes:**

- Decisions called for four entries but didn't specify section placement. Added two new sections — **Frontend runtime** (CSP) and **Testing** (three test-architecture defers) — placed alphabetically among the existing domain-grouped sections (Avatars, Data export, Frontend runtime, Legal, Testing) per the existing convention.
- Each entry matches the existing bullet format (bold title with period, body, trailing pointer) but uses the **Default: … Trigger: …** shape from the task block rather than a "See doc §" pointer-only pattern, because these decisions don't yet have a "home" Open-questions section in any underlying doc.

**Why:** Three architecture calls in this plan defer rather than decide. Logging them makes them findable when the trigger arrives and prevents re-litigation.

**Prerequisites:** None.

**Decisions:**

- Four new entries, each with a short title, current default, and the trigger that would prompt a revisit:
  - **Three-layer mock aggregator.** Default: no `tests/mocks/lists/`. Trigger: the same `vi.mock(...)` declarations repeating in five-plus test files.
  - **Hard coverage gate.** Default: review-enforced per `docs/quality.md`. Trigger: regression at the same component or function twice within a release cycle.
  - **happy-dom vs `@vitest/browser`.** Default: stay on happy-dom (current `web/vitest.config.ts`). Trigger: a back-stack, focus, or layout test that can't be made deterministic under jsdom-style DOM.
  - **CSP and the inline boot script in `app.html`.** Default: inline `<script>` in `app.html` runs the FOUC-preventing theme + font-size reads (Task 1.1); no Content-Security-Policy is enforced by Caddy today (`docs/architecture.md`, `docs/deployment.md` make no mention of one). Trigger: when a deployment-time CSP becomes a requirement, migrate the boot script to either a Caddy-issued CSP nonce or a hashed inline script — or move the reads into a tiny separate JS file referenced before `%sveltekit.head%`.

**Files:**

- `docs/open-questions.md` (modify)

**Steps:**

1. Read `docs/open-questions.md` to learn its existing entry format.
2. Append the four entries matching that format.

**Verify:** `grep -nE '(mock aggregator|coverage gate|happy-dom|inline boot script|CSP)' docs/open-questions.md` finds all four.

### [x] 0.4 Add styling-stance paragraph to `docs/architecture.md`

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:40:27Z

**Notes:**

- The wording sketch in Decisions referenced `docs/data-model.md` as an aside for the token table, but `data-model.md` makes no mention of design tokens — they live exclusively in `design/cairn-ui.jsx:3-33`. Dropped the stray reference from the appended paragraph; kept the `design/cairn-ui.jsx:3-33` pointer.

**Why:** `PLAN.md` cites `docs/architecture.md` for the "plain CSS variables, no Tailwind" stance, but the doc doesn't currently say it (a `grep -i tailwind docs/` returns nothing). Today the stance is implicit (Tailwind is simply not installed); pinning it down before the first component lands makes the convention canonical and prevents a future contributor from reaching for a utility framework "just for this one thing."

**Prerequisites:** None (parallel to 0.1–0.3).

**Decisions:**

- Append a single paragraph to the "Considered and rejected" section of `docs/architecture.md` (sibling to the existing entries on Firebase, Supabase hosted, Flutter Web, JWT in localStorage, etc.).
- Wording sketch: **"Tailwind / utility-class CSS frameworks." The 13-token CSS-variable table (`docs/data-model.md` aside, `design/cairn-ui.jsx:3-33`) is small enough not to need one, and plain scoped `<style>` blocks consuming `var(--…)` keep the production bundle minimal (no purge-step config to maintain, no Tailwind runtime to ship). Rejected as more machinery than the styling surface warrants; if the design system ever outgrows hand-written CSS, revisit then.**
- The paragraph slots in alphabetically or near the bottom — placement to match the section's existing rhythm; don't rewrite surrounding paragraphs.

**Files:**

- `docs/architecture.md` (modify)

**Steps:**

1. Read `docs/architecture.md:276-308` (the "Considered and rejected" section) to see the existing entry style.
2. Append the Tailwind / CSS-frameworks paragraph in matching style.

**Verify:** `grep -nE 'Tailwind|utility-class' docs/architecture.md` finds the new entry.

## Phase 1 — Scaffold and test harness

### [x] 1.1 Add web package deps, fix viewport meta

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:43:07Z

**Notes:**

- `pnpm` resolved both packages at recent 5.x: `@fontsource-variable/newsreader@5.2.10` and `@fontsource-variable/jetbrains-mono@5.2.8`. Both ship `wght.css` as the plan assumed — Task 2.1 can pin that subpath as written.

**Why:** Typography needs the two `@fontsource-variable` packages; safe-area handling needs `viewport-fit=cover` on the viewport meta per `docs/ui.md:125`; an inline boot script in `app.html` prevents a flash of incorrect theme for users who picked an explicit `light` / `dark` (the runtime `$effect` in Task 2.3 cannot paint before hydration). `@testing-library/svelte` and `@testing-library/jest-dom` are **already installed** (see `web/package.json:32`, `:23`); this task does not re-add them.

**Storage key reminder:** `docs/architecture.md:253-254` and `docs/data-model.md:13-14` register the two localStorage keys as `cairn.theme` and `cairn.font_size` (dot + underscore, _not_ `cairn:theme` / `cairn:font-size`). The inline boot script below — and Task 2.3 — must use those exact key names. `architecture.md`'s "Considered and rejected"/client-side-storage table is the legal source-of-truth for what we put on user terminals; we don't drift from it silently.

**Prerequisites:** Phase 0 (the conventions exist, so the deps land alongside docs that reference them).

**Decisions:**

- Use `pnpm` (the project's package manager, per `web/package.json`).
- `@testing-library/svelte` already present at `^5.3.1`; no install needed.
- The two `@fontsource-variable/*` are runtime deps because their CSS imports include woff2 files shipped to the browser.
- `app.html` change #1: add `viewport-fit=cover` to the existing viewport meta on line 5. The existing `text-scale` meta and the `<div style="display: contents">` wrapper stay as-is. The 100dvh height comes in Task 2.1 via `reset.css`.
- `app.html` change #2: insert an inline `<script>` immediately _before_ `%sveltekit.head%` that synchronously reads `localStorage['cairn:theme']` and `localStorage['cairn:font-size']` and applies them to `documentElement` (set `dataset.theme` for explicit `light`/`dark`; set `--font-size-scale` from the same map Task 2.3 uses). The script runs before paint, so the saved preference is in effect on first frame. The runtime `$effect.root` in `preferences.svelte.ts` (Task 2.3) re-applies the same values on hydration and on every change.

**Files:**

- `web/package.json` (modify)
- `web/pnpm-lock.yaml` (modify — regenerated)
- `web/src/app.html` (modify)

**Steps:**

1. In `web/`, run `pnpm add @fontsource-variable/newsreader @fontsource-variable/jetbrains-mono`.
2. After install, run `ls web/node_modules/@fontsource-variable/newsreader/*.css` and `ls web/node_modules/@fontsource-variable/jetbrains-mono/*.css` to confirm the CSS entrypoint shipped by the installed version (the plan assumes `wght.css`; some fontsource-variable packages ship `index.css` or per-weight files instead). Note the actual filename so Task 2.1's `@import` lines in `typography.css` pin the correct subpath.
3. Edit `web/src/app.html` line 5: change `content="width=device-width, initial-scale=1"` to `content="width=device-width, initial-scale=1, viewport-fit=cover"`.
4. Edit `web/src/app.html`: insert the inline preferences-boot `<script>` immediately above `%sveltekit.head%`. Body:
   ```html
   <script>
   	try {
   		const t = localStorage.getItem("cairn.theme");
   		if (t === "light" || t === "dark")
   			document.documentElement.dataset.theme = t;
   		const f = localStorage.getItem("cairn.font_size");
   		const SCALE = { xs: 0.85, s: 0.92, m: 1.0, l: 1.1, xl: 1.22 };
   		if (f && SCALE[f])
   			document.documentElement.style.setProperty(
   				"--font-size-scale",
   				String(SCALE[f]),
   			);
   	} catch {}
   </script>
   ```
   The `try {} catch {}` guards against storage-denied contexts (Safari private mode). The `'system'` case has no `data-theme` set, so the `@media (prefers-color-scheme: dark)` rule in `tokens.css` (Task 2.1) handles it via CSS. **No `typeof window` guard needed:** `app.html` is the browser-side template SvelteKit injects into the static bundle's shell; it executes only in the user's browser, never during SSR/prerender (SvelteKit prerenders by running components, not by evaluating `app.html` as JavaScript). The inline script is safe to call `localStorage` and `document` directly.

**Verify:** `pnpm --filter web check` · `grep viewport-fit web/src/app.html` · `grep cairn.theme web/src/app.html`.

### [x] 1.2 Create test render helper with `getByDataTest`

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:49:35Z

**Notes:**

- **Deviation from RED step's fixture approach.** The step said "build the test fixture inline using `@testing-library/svelte`'s `mount` of a small string-template component." That isn't feasible: `@testing-library/svelte` doesn't export `mount` (its only render entry point is `render`, which takes a real Svelte 5 component, not a template string), and Svelte 5 doesn't have a runtime compiler for template strings either. To honour "keeps the Files list of this task at two" I refactored: extracted a `bindDataTestQueries(container)` factory (the substantive logic) and tested it directly against a hand-built `<div>` populated via `innerHTML`. The `render(Component, props?)` wrapper is exported per the Decisions and a one-line `Object.assign(result, bindDataTestQueries(result.container))` — it will be exercised by every Phase 3/4 component test.
- **Typing the wrapper.** Annotating the wrapper's return type as `ReturnType<typeof tlRender> & DataTestQueries` triggered a `svelte-check` error because `tlRender`'s `RenderResult` carries a `Queries`-indexed signature whose value type (`BoundFunction<...>`) is incompatible with `container: HTMLElement` once the indexer constraint propagates. Dropping the explicit return annotation and letting TS infer (`Object.assign(result, queries)`) clears the error while preserving the same callable surface for consumers.

**Why:** Every component test in Phases 3–4 uses this helper as its entry point. Centralising it enforces the `data-test` convention at the API level — there's no easy way to query by CSS class through this helper, so tests stay on convention.

**Prerequisites:** Task 1.1 (`@testing-library/svelte` installed).

**Decisions:**

- Path: `web/src/lib/test/render.ts` (sibling to existing `handlers.ts`, `server.ts`).
- API: a thin `render<Props>(Component, props?)` wrapping `@testing-library/svelte`'s `render`, returning the wrapper's normal helpers plus three Cairn-specific helpers:
  - `getByDataTest(name): HTMLElement` — `querySelector('[data-test="…"]')`; throws if zero or multiple matches.
  - `queryByDataTest(name): HTMLElement | null` — returns null on absence.
  - `getAllByDataTest(name): HTMLElement[]` — returns the array.
- Helpers operate on `container` from the underlying render result.

**Reference:** R5 in REQUIREMENTS.md; the Cairn testing skill from Task 0.2.

**Files:**

- `web/src/lib/test/render.ts` (create)
- `web/src/lib/test/render.test.ts` (create)

**Steps:**

1. RED — Write `render.test.ts`. Build the test fixture inline inside the test file using `@testing-library/svelte`'s `mount` of a small string-template component — **do not** create a `fixtures/*.svelte` file (keeps the Files list of this task at two). The fixture should render `<span data-test="hello">hi</span>` plus `<span data-test="alpha">a</span><span data-test="alpha">b</span>`. Assert: `getByDataTest('hello')` returns the element; `queryByDataTest('missing')` returns null; `getByDataTest('alpha')` throws "multiple elements"; `getAllByDataTest('alpha')` returns length 2. Run `pnpm --filter web test`; confirm red.
2. GREEN — Write `render.ts` per Decisions.
3. Re-run `pnpm --filter web test`; confirm green.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

## Phase 2 — Tokens, theme, typography, preferences

### [x] 2.1 Lift design tokens; reset and typography; wire into layout

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:53:35Z

**Notes:**

- Prettier rewrote `tokens.css` on `prettier --write`: collapsed the multi-line `--shadow` into a single line and normalised `0.10` → `0.1` in two dark-mode `sage` values. The CSS-parse value is unchanged; the JS source-of-truth in `design/cairn-ui.jsx:27` still reads `0.10`, but the design canvas isn't load-bearing for runtime parsing — it's the visual reference. Worth noting in case a future grep correlates the two.
- Manual smoke (step 7) confirmed by user: "I can confirm that the website adjusts to the system's theme." `prefers-color-scheme: dark` rule is wired correctly via the `:not([data-theme=…])` guard.

**Why:** All component styles consume `var(--paper)`, `var(--ink)`, etc. The token table and typography plumbing must be wired into the root layout before any primitive is built — otherwise primitives ship with hard-coded colours that have to be retrofitted later.

**Prerequisites:** Task 1.1 (font packages installed).

**Decisions:**

- `tokens.css` blocks, in order:
  1. `:root { --paper: oklch(98% 0.012 85); … --shadow: 0 1px 0 …; --fab-bottom: calc(env(safe-area-inset-bottom) + 16px); --snackbar-bottom: calc(env(safe-area-inset-bottom) + 16px); }` — all **13** light tokens **verbatim from `design/cairn-ui.jsx:3-15`** (`paper`, `paperAlt`, `ink`, `inkSoft`, `stone`, `stoneLt`, `rule`, `sage`, `sageBg`, `ember`, `emberBg`, `accent`, `shadow`), plus the two safe-area-aware offsets.
  2. `:root[data-theme="dark"] { … }` — all 13 tokens overridden with dark values from `design/cairn-ui.jsx:18-32`.
  3. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="dark"]) { … } }` — same dark overrides; matches when no explicit `data-theme` is set, so 'system' default tracks the OS.
- `reset.css`: `*, *::before, *::after { box-sizing: border-box; }`; `html, body { height: 100dvh; margin: 0; }`; `body { background: var(--paper); color: var(--ink); font-family: 'Newsreader Variable', Georgia, serif; }`.
- `typography.css`: `@import '@fontsource-variable/newsreader/wght.css';` `@import '@fontsource-variable/jetbrains-mono/wght.css';` `:root { --font-size-scale: 1.0; font-size: calc(16px * var(--font-size-scale)); }`.
- `+layout.svelte` imports the three CSS files at the top of `<script lang="ts">` so SvelteKit's vite plugin bundles them. Order: `tokens.css`, then `reset.css` (so reset can use tokens), then `typography.css`.

**Reference:** `design/cairn-ui.jsx:3-33` (tokens, copy verbatim); `docs/ui.md:107-117` (semantic names). R6, R8, R9, R10.

**Files:**

- `web/src/lib/shared/styles/tokens.css` (create)
- `web/src/lib/shared/styles/reset.css` (create)
- `web/src/lib/shared/styles/typography.css` (create)
- `web/src/routes/+layout.svelte` (modify)

**Steps:**

1. Open `design/cairn-ui.jsx`; copy lines 3–15 (`CAIRN_LIGHT`, all 13 keys) into the first `:root` block of `tokens.css`, mapping JS keys to CSS variable names (`paper` → `--paper`, `paperAlt` → `--paper-alt`, `inkSoft` → `--ink-soft`, `stoneLt` → `--stone-lt`, `sageBg` → `--sage-bg`, `emberBg` → `--ember-bg`).
2. Copy lines 18–32 (`CAIRN_DARK`, all 13 keys) into both the `[data-theme="dark"]` block and the `@media (prefers-color-scheme: dark)` block.
3. Append `--fab-bottom` and `--snackbar-bottom` to the first `:root` block.
4. Write `reset.css` per Decisions.
5. Write `typography.css` per Decisions.
6. Edit `+layout.svelte`: add three `import '$lib/shared/styles/tokens.css';` lines (and the other two) at the top of `<script lang="ts">`.
7. Manually verify: `pnpm --filter web dev`; open the page in a browser; in devtools confirm `:root` shows `--paper`, body background is the warm cream colour, fonts have loaded (look for `Newsreader Variable` in computed font-family). Set `document.documentElement.dataset.theme = 'dark'` in the console — background should swap.

**Verify:** `pnpm --filter web check` · `pnpm --filter web test` · manual smoke per step 7.

### [x] 2.2 Safe-area named constants

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T09:56:11Z

**Why:** Components shouldn't hand-write `env(safe-area-inset-top)` strings. Named constants make the safe-area pattern grep-able and one-line.

**Prerequisites:** None.

**Decisions:**

- Path: `web/src/lib/shared/model/safe-area.ts`.
- Exports: `SAFE_TOP`, `SAFE_RIGHT`, `SAFE_BOTTOM`, `SAFE_LEFT` — each the raw `env(safe-area-inset-*)` string. (`tokens.css` separately bakes `--fab-bottom` and `--snackbar-bottom` for the cases where `calc(env(...) + 16px)` is the actual want.)
- A small test catches typos in the literals.

**Files:**

- `web/src/lib/shared/model/safe-area.ts` (create)
- `web/src/lib/shared/model/safe-area.test.ts` (create)

**Steps:**

1. RED — Write `safe-area.test.ts` with four assertions: `expect(SAFE_TOP).toBe('env(safe-area-inset-top)')`, and the same for `RIGHT`, `BOTTOM`, `LEFT`. Run `pnpm --filter web test`; confirm red.
2. GREEN — Write `safe-area.ts` with the four `export const` declarations.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 2.3 Preferences (theme + font-size) with layout mount

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:01:21Z

**Notes:**

- **Test-ordering pitfall, fixed.** The RED test (e) `assigning theme persists to localStorage` initially failed because by the time it ran, test (c) had already set `preferences.theme = 'dark'`. Svelte coalesces same-value assignments (Object.is equality) — re-assigning `'dark'` was a no-op, the effect didn't fire, and localStorage stayed `null` after `beforeEach` cleared it. Resolution: made `beforeEach` async, reset `preferences.theme = 'system'` / `fontSize = 'm'`, `await tick()` so the reset's effect fires _first_, then clear localStorage and remove DOM attributes. After tick, each test starts with in-memory defaults and a clean DOM/storage. This is the precise pitfall the task block warned about for `await tick()` placement, but the failure mode was "two tests sharing the same value" rather than "asserting before microtask flush" — worth noting for future runes-state test files.
- **User-requested cross-sync comments.** The user flagged that the storage keys and the `FONT_SCALE` map are duplicated between `src/app.html` (FOUC-prevent boot script) and `preferences.svelte.ts` (runtime module). Added matching pointer-comments to both files reminding maintainers to keep them in sync. Justifies a comment per CLAUDE.md's "WHY is non-obvious" rule — two sources of truth for the same constants is a hidden invariant.
- **Step 6 manual smoke not separately performed.** Step 6 calls for `pnpm dev` + setting `localStorage['cairn.theme'] = 'dark'` + reload. The user already confirmed the same wiring (boot script + runtime module reading the same localStorage keys) works for system-theme tracking during task 2.1's smoke; the data flow added here is mechanically identical for the explicit-light/dark path. Flagging that I did not redo the visual smoke for the explicit-theme + reload path — happy to if you want.
- **Side work: eslint config for `.svelte.ts`.** The first commit attempt failed because lefthook's eslint step couldn't parse `$state` / `$effect` syntax — `eslint.config.js` applied the svelte parser only to `**/*.svelte`. Extended the files glob to `['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts']` so any future runes-enabled `.svelte.ts` module lints cleanly. Folded into the same commit.

**Why:** Theme (light/dark/system) and font-size (XS–XL) are device-local preferences that must apply on first paint of every screen. Implementing them now as a runes module mounted from `+layout.svelte` means every subsequent primitive can assume `--font-size-scale` and `data-theme` are already correct.

**Prerequisites:** Task 2.1 (`tokens.css` and `typography.css` are loaded; `data-theme` attribute and `--font-size-scale` variable have visible effects).

**Decisions:**

- Path: `web/src/lib/shared/state/preferences.svelte.ts`.
- Exports a single `preferences` object created as `let preferences = $state({ theme: <read>, fontSize: <read> })`. Mutating `preferences.theme` / `preferences.fontSize` is reactive.
- **`$effect` cannot run at the top level of a `.svelte.ts` module** (the rune requires an effect context; calling it from module scope throws `effect_orphan` at runtime). Wrap the side-effecting effects in a single `$effect.root(() => { ... })` invoked once at module evaluation time. The root effect's destroy function is unused (effects run for the lifetime of the app). Inside the root: one `$effect` writes `preferences.theme` to `document.documentElement.dataset.theme` and `localStorage['cairn.theme']`; a second `$effect` writes the scale factor of `preferences.fontSize` to `document.documentElement.style.setProperty('--font-size-scale', …)` and `localStorage['cairn.font_size']`. Storage keys are dot + underscore — the contract registered in `docs/architecture.md:253-254` and `docs/data-model.md:13-14`, matching the boot script in Task 1.1.
- Initial values read from `localStorage` at module load; default to `'system'` and `'m'` if unset.
- Font-size scale map: `{ xs: 0.85, s: 0.92, m: 1.0, l: 1.1, xl: 1.22 }`.
- `+layout.svelte` imports the module for its side-effect — the `$effect.root(...)` call fires at module-evaluation time, no component subscription required.
- A co-located `__mocks__/preferences.svelte.ts` exposes the same `preferences` object shape but with plain (non-`$state`) initial values and no `$effect.root` call. Tests that don't care about preferences mock this to avoid touching `localStorage`.

**Reference:** `docs/ui.md:161-168` (device-local, system-by-default). R7, R8.

**Files:**

- `web/src/lib/shared/state/preferences.svelte.ts` (create)
- `web/src/lib/shared/state/preferences.test.ts` (create)
- `web/src/lib/shared/state/__mocks__/preferences.svelte.ts` (create)
- `web/src/routes/+layout.svelte` (modify)

**Steps:**

1. RED — Write `preferences.test.ts`. Five cases: (a) defaults `'system'` / `'m'` when localStorage empty; (b) localStorage values are read on init — seed `localStorage.setItem('cairn.theme', 'dark')` _first_, then `vi.resetModules()` and `await import('$lib/shared/state/preferences.svelte.ts')` to force fresh evaluation; assert the freshly imported `preferences.theme === 'dark'`. (Static `import` returns the cached module — re-evaluation requires `resetModules`.); (c) `preferences.theme = 'dark'` sets `document.documentElement.dataset.theme === 'dark'`; (d) `preferences.fontSize = 'l'` sets `--font-size-scale === '1.1'` on `:root`; (e) localStorage is written on change — assert `localStorage.getItem('cairn.theme') === 'dark'` after assignment. **`$effect` is asynchronous** — Svelte 5 schedules effect-runs on a microtask boundary, not synchronously on assignment. After every `preferences.theme = …` / `preferences.fontSize = …` mutation, `await tick()` (imported from `svelte`) before asserting on `document.documentElement` or `localStorage`. The naive `expect(...).toBe(...)` immediately after assignment will fail with a stale value; this is the most common pitfall when testing runes-state modules and the assertion error is non-obvious. Use `beforeEach(() => localStorage.clear())` only for _this_ file's localStorage isolation — it's not shared mock state, so it doesn't violate the no-shared-`beforeEach` rule. Run `pnpm --filter web test`; confirm red.
2. GREEN — Write `preferences.svelte.ts`. Read localStorage synchronously at module load; declare `$state({...})`; call `$effect.root(() => { $effect(...); $effect(...); })` once at module level to set up the DOM/localStorage write effects. Export the `preferences` object.
3. Write `__mocks__/preferences.svelte.ts` with the same shape but stub `$state` values and no effects (consumers test against the values, not the side-effects, when this mock is in play).
4. Edit `+layout.svelte`: add `import '$lib/shared/state/preferences.svelte.ts';` at the top of `<script lang="ts">`.
5. Re-run `pnpm --filter web test`; confirm green.
6. Manual smoke: `pnpm --filter web dev`; in devtools console set `localStorage['cairn.theme'] = 'dark'; location.reload()`. Page renders dark.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check` · manual smoke per step 6.

## Phase 3 — Basic primitives & back-stack

### [x] 3.1 Icon primitive + icon-paths.ts

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:10:39Z

**Notes:**

- **Side work — vitest.config.ts:** First component-render test in the repo. `@testing-library/svelte` failed with `lifecycle_function_unavailable: mount(...) is not available on the server` because Vite was picking Svelte's server build under Node conditions. Added `resolve: { conditions: ['browser'] }` to `web/vitest.config.ts` (with a short comment). Pure-unit tests under `src/lib/shared/state/` and `src/lib/shared/model/` continue to pass; this only affects how `svelte` itself resolves during test runs.
- Dedupes applied as the task specified: dropped the second `'inbox'` entry (identical to the first) and dropped the `:111` `'slash'` entry, keeping the lucide canonical `:121` `'slash'` (`M22 12a10 10 0 1 1-20 0 …`).

**Why:** Downstream primitives need icons: `Button` (optional leading icon), `TopBar` (back arrow), `Snackbar` (close X). Building `Icon` first means consumers import one component with a `name` prop. No runtime icon library is added — paths are inlined from `design/cairn-ui.jsx:71+`.

**Prerequisites:** Task 2.1 (tokens provide `--ink` for default colour).

**Decisions:**

- `icon-paths.ts` exports `const ICON_PATHS = { 'arrow-up': '…', 'arrow-down': '…', … } as const` and `type IconName = keyof typeof ICON_PATHS`. Copy the entire `ICON_PATHS` object from `design/cairn-ui.jsx:71+` — keys and `d` strings — with two dedupes: the source defines `'inbox'` twice (`design/cairn-ui.jsx:114` and `:120`, identical values — drop either) and `'slash'` twice (`:111` and `:121`, _different_ paths — keep the `:121` entry, the lucide canonical circle-with-diagonal; drop the `:111` two-strokes entry). ESLint's `no-dupe-keys` rule (enabled via `js.configs.recommended` in `web/eslint.config.js:21`) will otherwise fail the build. Don't fix the duplicates in `design/cairn-ui.jsx` from this task; that's a separate design-source cleanup outside this plan's scope.
- `Icon.svelte` props: `name: IconName`, `size: number = 20`, optional `'data-test'?: string`. Renders `<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-test={...}><path d={ICON_PATHS[name]} /></svg>`. `currentColor` lets callers control colour via CSS.
- `__mocks__/Icon.svelte`: `<script>let { name, ...rest } = $props();</script><span data-test={rest['data-test'] ?? name}></span>`.

**Reference:** R12. `design/cairn-ui.jsx:71+` for the full path table.

**Files:**

- `web/src/lib/basic/model/icon-paths.ts` (create)
- `web/src/lib/basic/components/Icon.svelte` (create)
- `web/src/lib/basic/components/Icon.test.ts` (create)
- `web/src/lib/basic/components/__mocks__/Icon.svelte` (create)

**Steps:**

1. RED — Write `Icon.test.ts`: render `<Icon name="arrow-up" data-test="up" />`, assert the rendered `<svg>` has a child `<path>` whose `d` attribute equals `ICON_PATHS['arrow-up']`, and that the SVG element has `data-test="up"`. Run `pnpm --filter web test`; confirm red.
2. GREEN — Port `ICON_PATHS` from `design/cairn-ui.jsx:71+` into `icon-paths.ts`. Implement `Icon.svelte`.
3. Write the `__mocks__/Icon.svelte` stub.
4. Re-run tests.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 3.2 Button primitive with variants

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:14:39Z

**Why:** Every interactive surface uses `Button`. Three variants — `primary`, `ghost`, `destructive` — cover the foundation needs; the destructive variant uses `--ember` and is reserved for genuinely destructive actions per `docs/ui.md:111`.

**Prerequisites:** Task 2.1 (tokens), Task 3.1 (Icon — Button can accept an icon slot).

**Decisions:**

- Props: `variant: 'primary' | 'ghost' | 'destructive' = 'primary'`, `disabled?: boolean`, `type?: 'button' | 'submit' = 'button'`, optional `'data-test'?: string`, default slot for label, named `icon` slot.
- Dispatches a `click` event when pressed (Svelte 5 callback prop pattern: accept an `onclick?: () => void` prop and call it).
- Scoped `<style>` block: each variant uses tokens. `primary` → `background: var(--accent); color: var(--paper);`; `ghost` → transparent with `color: var(--ink);`; `destructive` → `background: var(--ember); color: var(--paper);`. All variants: `padding: 0.5rem 1rem; border-radius: 6px; border: none; font: inherit;`. The variant name is also applied as a CSS class on the rendered `<button>` (`class:primary`, `class:ghost`, `class:destructive`) so the scoped styles can target it — the class is part of the styling mechanism, not a test hook.
- `__mocks__/Button.svelte`: Svelte 5 snippet props — `<script>let { children, onclick, ...rest } = $props();</script><button data-test={rest['data-test']} onclick={onclick}>{@render children?.()}</button>`.

**Reference:** `docs/ui.md:111` (destructive red is the same red as confirmations). R13.

**Files:**

- `web/src/lib/basic/components/Button.svelte` (create)
- `web/src/lib/basic/components/Button.test.ts` (create)
- `web/src/lib/basic/components/__mocks__/Button.svelte` (create)

**Steps:**

1. RED — Write `Button.test.ts`: (a) render `<Button data-test="go" onclick={fn}>Go</Button>`; click via `await fireEvent.click(getByDataTest('go'))`; assert `fn` was called; (b) render `<Button variant="destructive" data-test="x">Delete</Button>`; assert the rendered element has the `destructive` class (`getByDataTest('x').classList.contains('destructive')`). The class is the same one the scoped `<style>` block targets, so the assertion checks a real styling hook rather than a test-only attribute; (c) `disabled` prevents click. Run `pnpm --filter web test`; confirm red.
2. GREEN — Implement `Button.svelte` per Decisions, applying the variant name as a CSS class on the rendered `<button>` (`class:primary={variant === 'primary'}` etc., or the equivalent `class={variant}`) so the scoped styles take effect and tests can assert the class.
3. Write the mock.
4. Re-run tests.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 3.3 Fab primitive with safe-area positioning

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:17:15Z

**Why:** The floating action button is the New-list affordance on the Lists screen (master-plan step 4) and elsewhere. Its bottom offset must use `--fab-bottom` (defined in `tokens.css`, includes `env(safe-area-inset-bottom)`) so it never sits under the iOS home indicator.

**Prerequisites:** Task 2.1 (`--fab-bottom` exists), Task 3.1 (Icon).

**Decisions:**

- Path: `web/src/lib/basic/components/Fab.svelte`.
- Renders a `<button>` with `position: fixed; bottom: var(--fab-bottom); right: 16px;` plus visual styling (circle, accent background, shadow from `--shadow`).
- Accepts `onclick?`, `'aria-label'`, `'data-test'`, and a default slot (for icon).
- Test asserts the rendered element's inline or computed style includes `bottom: var(--fab-bottom)`. happy-dom returns the unresolved `var(...)` string in `getPropertyValue` for inline styles — good enough.

**Reference:** `docs/ui.md:129` ("Never a bare `16px` on `bottom`"). R10, R13.

**Files:**

- `web/src/lib/basic/components/Fab.svelte` (create)
- `web/src/lib/basic/components/Fab.test.ts` (create)
- `web/src/lib/basic/components/__mocks__/Fab.svelte` (create)

**Steps:**

1. RED — Write `Fab.test.ts`: (a) render `<Fab data-test="fab" aria-label="New" onclick={fn}>+</Fab>`; assert rendered element's `style.bottom === 'var(--fab-bottom)'`; (b) click dispatches `onclick`. Confirm red.
2. GREEN — Write `Fab.svelte`.
3. Mock.
4. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 3.4 Back-stack utility `pushHistoryGuard`

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:21:23Z

**Why:** Every dismissible overlay (Sheet, Accordion in this plan; later: profile sheet, invite picker, etc.) pushes a history entry on open and listens for `popstate` to close. Centralising this in one tiny utility means each overlay primitive is two lines of integration rather than five lines of boilerplate, and the back-stack semantics in `docs/ui.md:137-153` stay enforced by construction.

**Prerequisites:** None (pure browser-API utility).

**Decisions:**

- Path: `web/src/lib/shared/state/back-stack.svelte.ts`.
- API: `export function pushHistoryGuard(onPop: () => void): () => void`.
- Implementation (per-id matching, one listener per guard — no module-level stack needed):
  - On call: generate a fresh marker id (`crypto.randomUUID()`); call `history.pushState({ cairnGuard: true, id }, '')`. Track a closure-local `fired` flag initialised `false`.
  - **Self-scoped listener.** Register a `popstate` listener that fires `onPop` iff `event.state?.id !== id` (i.e., this guard's marker is no longer the top of history) and `fired === false`. On fire, set `fired = true`, remove the listener, and call `onPop()`. Per-id matching is what isolates stacked overlays: when Sheet B sits on top of Sheet A and the user presses back, B's marker is popped, the new top is A's marker, so A's listener sees `event.state?.id === A.id` (still on top — does nothing) and B's listener sees `event.state?.id === A.id !== B.id` (fires). One back press, one overlay closes.
  - Returned cleanup: if `fired === true`, return immediately (no-op). Otherwise set `fired = true`, remove the listener, and call `history.back()` to pop the marker the function pushed. Removing the listener before `history.back()` keeps the resulting `popstate` from re-entering `onPop`.
  - The cleanup is idempotent and safe to invoke from a Svelte `$effect` cleanup after `popstate` has already fired. Production sequence: popstate → guard fires `onPop` → consumer flips `open=false` → effect cleanup invokes the returned function → no-op (because `fired` is already true). Without the `fired` flag, the cleanup would call `history.back()` a second time and pop the _parent route_.
- The function is **not** a `$effect.root` — it's just a function. Callers wrap it in `$effect` themselves to integrate with component lifecycle.
- Co-locate `__mocks__/back-stack.svelte.ts` that exports a `vi.fn()` for `pushHistoryGuard` returning a `vi.fn()` cleanup. Overlay tests will mock this when they don't care about real history.

**Reference:** `docs/ui.md:137-153`. R11.

**Files:**

- `web/src/lib/shared/state/back-stack.svelte.ts` (create)
- `web/src/lib/shared/state/back-stack.test.ts` (create)
- `web/src/lib/shared/state/__mocks__/back-stack.svelte.ts` (create)

**Steps:**

1. RED — Write `back-stack.test.ts`. Five cases: (a) `pushHistoryGuard` calls `history.pushState` with a guard marker carrying a unique `id` — spy on `history.pushState` and assert it was called with a state object where `cairnGuard === true` and `typeof id === 'string'`; (b) dispatching a synthetic `popstate` event calls `onPop` once and only once (subsequent popstates do not re-trigger); (c) calling the returned cleanup _before_ `popstate` fires calls `history.back` — spy on it; assert called once; (d) calling the returned cleanup _after_ a synthetic `popstate` has fired must NOT call `history.back` — assert the `history.back` spy has zero calls beyond what case (c) accumulates. **(d) guards against the double-pop regression**; (e) **stacked-guards isolation**: call `pushHistoryGuard(onPopA)` then `pushHistoryGuard(onPopB)` (two guards live simultaneously); dispatch a synthetic `popstate` that simulates B's marker being popped (the post-popstate `history.state` is A's marker — construct the event with that state); assert `onPopB` was called exactly once and `onPopA` was **not** called. Then dispatch another popstate simulating A's marker being popped; assert `onPopA` fires. This pins down the contract that a single back press collapses only the top-most overlay, not all of them. Run; confirm red.
2. GREEN — Write `back-stack.svelte.ts` per Decisions.
3. Write the mock.
4. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 3.5 Sheet primitive (back-stack integrated)

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:29:48Z

**Why:** The generic bottom-sheet is the basis for delete-item confirmation, list overflow menu, invite picker, avatar source sheet, and discard-changes prompt. None of those land in this plan, but Sheet must be available — with back-stack integration baked in — when step 4 (MVP) starts consuming it.

**Prerequisites:** Task 3.4 (`pushHistoryGuard`), Task 2.1 (tokens).

**Decisions:**

- Path: `web/src/lib/basic/components/Sheet.svelte`.
- Props: `open: boolean` (controlled), `onclose: () => void` (callback when the sheet wants to close), default slot for content. Optional `'data-test'`.
- When `open` flips `false → true`, an `$effect` calls `pushHistoryGuard(() => onclose())` and stores the returned cleanup. When `open` flips `true → false`, the effect calls the stored cleanup (which pops the history marker if it hasn't already been popped). When the component unmounts, same cleanup.
- Visual: `position: fixed; left: 0; right: 0; bottom: 0; background: var(--paper); padding: 1rem calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) calc(1rem + env(safe-area-inset-left)); box-shadow: var(--shadow); border-radius: 16px 16px 0 0;`. (CSS padding shorthand is top/right/bottom/left — the right-inset belongs in slot 2 and the left-inset in slot 4. Verify this when writing the file; an earlier draft of this plan had them swapped.) Hidden when `open === false` (`display: none`).
- `__mocks__/Sheet.svelte`: Svelte 5 snippet props — `<script>let { open, children, ...rest } = $props();</script>{#if open}<div data-test={rest['data-test']}>{@render children?.()}</div>{/if}`.

**Reference:** `docs/ui.md:146` (sheets push history). R11, R13.

**Files:**

- `web/src/lib/basic/components/Sheet.svelte` (create)
- `web/src/lib/basic/components/Sheet.test.ts` (create)
- `web/src/lib/basic/components/__mocks__/Sheet.svelte` (create)

**Steps:**

1. RED — Write `Sheet.test.ts`. Mock `back-stack.svelte.ts` via `vi.mock('$lib/shared/state/back-stack.svelte.ts')` (automock picks up the `__mocks__/` file from Task 3.4). Tests: (a) when `open` flips false → true, `pushHistoryGuard` is called once; (b) when `open` flips true → false, the cleanup returned by `pushHistoryGuard` is called; (c) the content slot renders only when `open === true`. Confirm red.
2. GREEN — Implement `Sheet.svelte` per Decisions.
3. Mock.
4. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

## Phase 4 — Shared primitives

### [x] 4.1 CairnGlyph and CairnWordmark

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T10:34:47Z

**Why:** TopBar's title slot uses the wordmark on the Lists root; the glyph alone may appear on the auth landing page (step 3) and on the splash. Porting both now keeps step 2 self-contained.

**Prerequisites:** Task 2.1 (tokens — Wordmark uses `--ink` and `--accent`).

**Decisions:**

- Paths: `web/src/lib/shared/components/CairnGlyph.svelte` and `CairnWordmark.svelte`.
- `CairnGlyph` props: `size?: number = 22`, `color?: string` (defaults to `currentColor` if omitted). SVG markup copied verbatim from `design/cairn-ui.jsx:38-52` (three stacked ellipses + a topper circle), converted to Svelte syntax (`{size}` interpolation, `fill={color ?? 'currentColor'}`).
- `CairnWordmark` props: `size?: number = 22`. Renders an inline-flex span with the glyph + the word "Cairn" in Newsreader. Markup copied from `design/cairn-ui.jsx:54-66`; replace the JS `style={...}` with a scoped `<style>` block consuming `var(--ink)` and `var(--accent)`.
- Both render a `data-test` if passed.

**Reference:** `design/cairn-ui.jsx:38-67`. R13.

**Files:**

- `web/src/lib/shared/components/CairnGlyph.svelte` (create)
- `web/src/lib/shared/components/CairnGlyph.test.ts` (create)
- `web/src/lib/shared/components/CairnWordmark.svelte` (create)
- `web/src/lib/shared/components/CairnWordmark.test.ts` (create)

**Steps:**

1. RED — Write tests: Glyph renders an `<svg>` with the right viewBox (`0 0 24 24`) and exactly four shape children (3 ellipses + 1 circle); Wordmark renders the text "Cairn" and contains a child Glyph. Confirm red.
2. GREEN — Write both components per `design/cairn-ui.jsx:38-67`.
3. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 4.2 TopBar with always-`history.back()` back arrow

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T11:39:42Z

**Why:** Every screen except the Lists root has a TopBar with a back arrow. The arrow must always call `history.back()` (never a hard-coded route) so it never disagrees with the system back gesture per `docs/ui.md:145`.

**Prerequisites:** Task 3.1 (Icon — used for the chevron-left), Task 3.2 (Button — TopBar's back arrow is a ghost Button), Task 4.1 (CairnWordmark — TopBar's title slot may render it).

**Decisions:**

- Path: `web/src/lib/shared/components/TopBar.svelte`.
- Layout: a header bar with safe-area top padding (`padding-top: env(safe-area-inset-top); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right);`).
- Three regions: left (back arrow, optional via `showBack: boolean = true`), centre (the title — the **default `children` snippet**), right (an optional **named snippet** prop, `right?: Snippet`, for action buttons like the settings cog).
- Props shape in Svelte 5 — use the project's typed-destructure pattern (see `web/src/routes/+layout.svelte:5`), not the `$props<T>()` generic form:
  ```ts
  import type { Snippet } from "svelte";
  let {
  	showBack = true,
  	right,
  	children,
  	...rest
  }: {
  	showBack?: boolean;
  	right?: Snippet;
  	children: Snippet;
  	["data-test"]?: string;
  } = $props();
  ```
  The title is rendered with `{@render children()}` in the centre region; the right region renders `{#if right}{@render right()}{/if}`. A default snippet for the title (rather than a named `title` snippet) keeps call sites uncluttered — `<TopBar>Items</TopBar>` is the common case.
- Back arrow: a `<Button variant="ghost" onclick={() => history.back()}>`. Always `history.back()` — never accept a `back` prop with a route URL. If callers want to override the back behaviour, they accept the consequences; the prop doesn't exist.
- Co-locate a `__mocks__/TopBar.svelte` for downstream tests.

**Reference:** `docs/ui.md:145`. R13.

**Files:**

- `web/src/lib/shared/components/TopBar.svelte` (create)
- `web/src/lib/shared/components/TopBar.test.ts` (create)
- `web/src/lib/shared/components/__mocks__/TopBar.svelte` (create)

**Steps:**

1. RED — Write `TopBar.test.ts`. Mock `Button` (automock). Cases: (a) Mount `<TopBar><span data-test="title">Hello</span></TopBar>` — the default snippet is the title; assert `getByDataTest('title')` renders. (b) Click the back-arrow button (`getByDataTest('topbar-back')`); spy on `history.back`; assert it was called. (c) Mount with `showBack={false}`; assert no back button rendered. (d) Mount with a `right` snippet (`{#snippet right()}<span data-test="cog">⚙</span>{/snippet}`); assert `getByDataTest('cog')` renders. Confirm red.
2. GREEN — Implement `TopBar.svelte`. Use `data-test="topbar-back"` on the back button. The back arrow uses `<Icon name="chevron-left" />` (or `arrow-left` — pick from the ported set; check `icon-paths.ts`).
3. Mock.
4. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 4.3 ButtonPair with enforced left/right semantics

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T11:41:30Z

**Why:** Cairn's convention is consistent everywhere: left button is backward/destructive, right is forward/committal (`CLAUDE.md` Conventions; `docs/ui.md` "Button order in pairs"). A primitive that enforces this — taking `left` and `right` slots by name, in that order — makes the convention impossible to get wrong by accident.

**Prerequisites:** Task 3.2 (Button).

**Decisions:**

- Path: `web/src/lib/shared/components/ButtonPair.svelte`.
- Two **snippet props** (Svelte 5; named slots are the legacy Svelte 4 form and not used here): `left: Snippet` (the backward / destructive button) and `right: Snippet` (the forward / committal button). Both required — no default snippet, no `children` prop. Callers pass them either as variables (`<ButtonPair {left} {right} />`) or inline (`<ButtonPair>{#snippet left()}…{/snippet}{#snippet right()}…{/snippet}</ButtonPair>`).
- Renders a `<div>` with `display: flex; gap: 0.5rem; justify-content: flex-end;`. Inside: `{@render left()}` followed by `{@render right()}` so `right` is last in DOM order (and therefore visually on the right with `flex-end`). On narrow viewports they stack — left on top, right on bottom.
- Optional `'data-test'`.

**Reference:** `CLAUDE.md` Conventions; `docs/ui.md` "Button order in pairs". R13.

**Files:**

- `web/src/lib/shared/components/ButtonPair.svelte` (create)
- `web/src/lib/shared/components/ButtonPair.test.ts` (create)

**Steps:**

1. RED — Write `ButtonPair.test.ts`. Mount with two inline snippets, each containing a `<Button>` with a distinct `data-test`: `<ButtonPair>{#snippet left()}<Button data-test="cancel">Cancel</Button>{/snippet}{#snippet right()}<Button data-test="ok">OK</Button>{/snippet}</ButtonPair>`. Assert: (a) both rendered; (b) `getByDataTest('ok')` element appears _after_ `getByDataTest('cancel')` in DOM order (e.g. via `Node.compareDocumentPosition` or a `container.querySelectorAll('[data-test]')` index comparison). Confirm red.
2. GREEN — Implement using snippet props (`left: Snippet`, `right: Snippet`) and render with `{@render left()}` then `{@render right()}` inside the flex container.
3. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 4.4 Snackbar with 6-second timer, no history push

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T11:43:38Z

**Why:** The undo snackbar appears after destructive actions (delete item, archive list). It's a transient surface — dismissing itself on a 6-second timer — and **does not** push history (`docs/ui.md:149`). Building it now means master-plan step 4's delete-item flow has the surface ready.

**Prerequisites:** Task 2.1 (tokens — uses `--snackbar-bottom`).

**Decisions:**

- Path: `web/src/lib/shared/components/Snackbar.svelte`.
- Props: `open: boolean` (controlled), `message: string`, `actionLabel?: string`, `onaction?: () => void`, `onclose: () => void`, optional `'data-test'`.
- When `open` flips false → true, an `$effect` starts a `setTimeout(onclose, 6000)`. If `open` flips back to false (or the component unmounts) before the timer fires, the effect's cleanup clears the timeout. **Never** calls `pushHistoryGuard` — explicit in code and asserted in tests.
- Visual: `position: fixed; left: 16px; right: 16px; bottom: var(--snackbar-bottom); background: var(--ink); color: var(--paper); padding: 0.75rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;`. Hidden when `open === false`.

**Reference:** `docs/ui.md:149`. R13.

**Files:**

- `web/src/lib/shared/components/Snackbar.svelte` (create)
- `web/src/lib/shared/components/Snackbar.test.ts` (create)
- `web/src/lib/shared/components/__mocks__/Snackbar.svelte` (create)

**Steps:**

1. RED — Write `Snackbar.test.ts`. Use `vi.useFakeTimers()` per-test (not in a shared `beforeEach`). (a) Mount with `open=true`; advance timers 6000 ms; assert `onclose` called once. (b) Mount with `open=true`; flip `open=false` after 1000 ms; advance timers to 6000 ms; assert `onclose` NOT called (cleanup cancelled the timer). (c) Assert the test file's import of `back-stack.svelte.ts` is **never** called — mock the module and assert `pushHistoryGuard` mock has zero calls. (d) Clicking the action button calls `onaction`. Confirm red.
2. GREEN — Implement `Snackbar.svelte`.
3. Mock.
4. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check`.

### [x] 4.5 Accordion with back-stack canary assertion

**Created:** 2026-05-13T08:29:11Z
**Completed:** 2026-05-13T11:51:07Z

**Why:** Master-plan step 2's exit criteria explicitly require "Vitest component tests, including a back-stack assertion on at least one overlay primitive" (`plans/0000_implementation_order.md:57-58`). Accordion is that canary: it's the simplest overlay (expand/collapse on the same screen) and exercises the full back-stack flow.

**Prerequisites:** Task 3.4 (`pushHistoryGuard`), Task 3.1 (Icon — for the expand/collapse chevron).

**Decisions:**

- Path: `web/src/lib/shared/components/Accordion.svelte`.
- Props: `expanded: boolean` (controlled), `pushesHistory: boolean` (**required, no default**), `onexpand: () => void`, `oncollapse: () => void`, named slots `header` and `body`, optional `'data-test'`. The mandatory `pushesHistory` is the lever for the two-shape problem in R11: items-screen item panel passes `true` (single-overlay semantics, back-collapses), lists-screen list-description expand passes `false` (multiple-open semantics, back does its normal thing). TypeScript should mark it required so a caller forgetting it fails type-check.
- When `pushesHistory === true`, an `$effect(() => { if (expanded && pushesHistory) { const cleanup = pushHistoryGuard(() => oncollapse()); return cleanup; } })` installs the guard **whenever `expanded` is `true`** — including on initial mount with `expanded={true}`, not just on a false → true transition. The effect's cleanup runs on `expanded` flipping back to `false` or on component unmount. When `pushesHistory === false`, the inner block never runs and `pushHistoryGuard` is never imported into the call graph — expand/collapse is pure local state.
- The component is _the_ canary for R11 — its test is the master-plan-required assertion that a synthetic `popstate` closes the overlay (run with `pushesHistory={true}`). A paired test asserts that `pushesHistory={false}` makes zero calls to `pushHistoryGuard`.
- Visual: header is always rendered (clickable to toggle); body is rendered only when `expanded`. Chevron icon is `<Icon name="chevron-right" />` (the lucide convention for collapsed accordions); when `expanded` is true a CSS class rotates the chevron 90° (`transform: rotate(90deg)`) so it visually becomes a `chevron-down` without swapping the icon. Use a CSS transition on `transform` for the 150ms animation.

**Reference:** `docs/ui.md:146` (overlays push history); `plans/0000_implementation_order.md:57-58` (master-plan exit criterion). R11.

**Files:**

- `web/src/lib/shared/components/Accordion.svelte` (create)
- `web/src/lib/shared/components/Accordion.test.ts` (create)
- `web/src/lib/shared/components/__mocks__/Accordion.svelte` (create)

**Steps:**

1. RED — Write `Accordion.test.ts`. **Do not** mock `back-stack.svelte.ts` for the canary tests; use the real implementation so the popstate path is end-to-end. **Per-test isolation:** spy on `history.back` _inside_ each test (`vi.spyOn(window.history, 'back')`), not at file scope, and call `vi.restoreAllMocks()` at the end of each test (or scope the spy with `using` if available). happy-dom's `history` and `history.state` persist across tests in the same file unless explicitly reset; cases (b) and (c) both push markers, so without per-test restoration their counters and `history.state` leak. The harness's `cleanup()` in `vitest.setup.ts` unmounts components but does **not** reset `history`. If a test pushes a marker that doesn't get popped, reset by calling `history.replaceState(null, '')` in the test's teardown. Cases:
   - (a) Mount with `expanded=false, pushesHistory=true`; click the header; assert `onexpand` called.
   - (b) Mount with `expanded=true, pushesHistory=true`; dispatch `window.dispatchEvent(new PopStateEvent('popstate'))`; assert `oncollapse` called once. **This is the canary.**
   - (c) Mount with `expanded=true, pushesHistory=true`; flip `expanded=false` via props; assert `history.back` was called by the cleanup (i.e. the component proactively pops the marker if the user cancelled some other way).
   - (d) Body slot only renders when `expanded === true` (run with either `pushesHistory` value — the visual layer is independent of history).
   - (e) **`pushesHistory={false}` paired assertion.** For this case only, mock `back-stack.svelte.ts` via `vi.mock(...)` (automock picks up the `__mocks__/` file from Task 3.4). Mount with `expanded=false, pushesHistory=false`; flip `expanded=true`; assert the mock `pushHistoryGuard` has **zero** calls. Then dispatch a synthetic `popstate`; assert `oncollapse` is **not** called (no listener was registered). This pins down the lists-screen contract — multiple-open list descriptions don't all collapse on a single back press.
     Confirm red.
2. GREEN — Implement `Accordion.svelte`.
3. Mock.
4. Re-run.

**Verify:** `pnpm --filter web test` · `pnpm --filter web check` · `./scripts/check.sh` (full project gate — this is the last task, so the whole foundation should be green).

**Notes:**

- **Test-file split.** Cases (a)–(d) need the _real_ `back-stack.svelte` module (popstate end-to-end, real `pushState`/`back` calls), while case (e) needs `vi.mock('$lib/shared/state/back-stack.svelte')` to assert zero calls on the mock. `vi.mock` is hoisted file-scope, so case (e) lives in a separate `Accordion.no-push.test.ts`. `Accordion.test.ts` holds (a)–(d) with per-test `vi.spyOn(history, 'back')` and an `afterEach` of `vi.restoreAllMocks()` + `history.replaceState(null, '')` for the cross-test isolation the task block called out.
- **cspell side-work.** `onexpand` and `oncollapse` (and `onaction` from Task 4.4) are Svelte 5 lowercase-callback prop names — cspell flagged them; added all three to `cspell.json`. The user noted they wish the Svelte 5 convention were camelCase but accepted it.
- `./scripts/check.sh` green — full foundation passes. Master-plan checkbox in `plans/0000_implementation_order.md:46` is ready for the user to tick.
- Deleted plan-mode scratch file at `~/.claude/plans/` per the task reminder.
