# Requirements: Web foundation

Step 2 of the master roadmap (`plans/0000_implementation_order.md:46-58`).
The SvelteKit scaffold at `web/` currently has no shared components, no
design tokens, no theme system, no back-stack utility. Every later step
(auth, lists, avatars, invites, PWA) builds on the primitives and
conventions defined here, so this plan also pins down how `web/` is
organised — directory layout, mock placement, testing rules — to keep
later domains predictable.

## R1. Domain folders are nested by type under `web/src/lib/`

Each domain lives at `web/src/lib/<domain>/` and contains, where
applicable, the subfolders `components/`, `state/`, `model/`, and
`views/`. `components/` holds `.svelte` files; `state/` holds
`.svelte.ts` runes modules; `model/` holds non-reactive `.ts` (types,
helpers, pure functions); `views/` is reserved for page-level
components and is usually empty because page components live in
SvelteKit's `src/routes/`.

This is the canonical shape — `basic/`, `shared/`, and every later
domain (`auth/`, `list/`, `avatar/`, `settings/`, `invites/`, …) all
follow it. A domain folder must not introduce other subfolders without
extending the convention in `docs/frontend-layout.md` first.

## R2. Three-tier split: `basic/`, `shared/`, per-domain

`web/src/lib/` contains exactly three kinds of folders:

- **`basic/`** — framework-agnostic UI primitives that have no
  knowledge of Cairn domain concepts (Button, Icon, Sheet, Fab).
- **`shared/`** — Cairn-aware cross-cutting modules used from more
  than one domain (TopBar, ButtonPair, Snackbar, Accordion, theme +
  font-size preferences, back-stack utility, safe-area constants).
- **Per-domain folders** — each owns one bounded concept (`auth/`,
  `list/`, `avatar/`, …). A domain may depend on `basic/` and
  `shared/` but must not import from sibling domains; cross-domain
  collaboration goes through `shared/`.

## R3. Filename conventions

- Svelte components: `PascalCase.svelte` (`ListRow.svelte`,
  `TopBar.svelte`).
- Runes modules: `kebab-case.svelte.ts` (`back-stack.svelte.ts`,
  `preferences.svelte.ts`).
- Plain TypeScript modules in `model/`: `kebab-case.ts`
  (`icon-paths.ts`, `safe-area.ts`).
- Tests sit next to their source with `.test.ts` suffix
  (`ListRow.svelte` → `ListRow.test.ts`,
  `back-stack.svelte.ts` → `back-stack.test.ts`).
- Co-located mocks live under `__mocks__/` next to the source and
  share the source's exact filename (`__mocks__/ListRow.svelte`,
  `__mocks__/back-stack.svelte.ts`).

## R4. Hybrid mock placement

Vitest's automock is the default path: when a test calls
`vi.mock('$lib/list/ListRow.svelte')` without a factory, it picks up
`web/src/lib/list/components/__mocks__/ListRow.svelte` automatically.
A `__mocks__/<name>` file is **required** for every component or
state module that's mocked from more than one test. Inline
`vi.mock(path, factory)` is allowed for one-off mocks where building
a co-located file would be more friction than the test is worth.

`__mocks__/` files are minimal stubs that follow the codebase's
Svelte 5 runes posture — never `<slot />` (legacy Svelte 4 syntax,
allowed in compat mode but inconsistent with every component this
plan ships). The canonical component-mock form is:

```svelte
<script>let { children, ...rest } = $props();</script>
<span data-test={rest['data-test']}>{@render children?.()}</span>
```

State-module mocks export `vi.fn()` stubs; tests configure return
values per-test via `vi.spyOn` or `mockReturnValue`.

## R5. Testing rules: data-test, no shared beforeEach, MSW at network

Component and state-module tests follow these rules:

- DOM queries use `data-test="…"` attributes, never CSS classes or
  text content. A `getByDataTest(name)` helper at
  `web/src/lib/test/render.ts` is the canonical entry point.
- Each test sets up its own mocks. No shared `beforeEach` block at
  file or suite scope; per-test isolation is the rule.
- HTTP is mocked at the network layer via MSW (existing handlers in
  `web/src/lib/test/handlers.ts`), not through a fake API wrapper.
- Component tests assert user-visible behaviour: props in, events /
  rendered output / state changes out. They do not assert internals.

A three-layer mock aggregator (à la someday's `tests/mocks/lists/`) and
a hard coverage gate are deliberately deferred — see the
Non-requirements section.

## R6. Design tokens are CSS custom properties

The two token objects in `design/cairn-ui.jsx:3-33` (`CAIRN_LIGHT`,
`CAIRN_DARK`) are lifted verbatim into
`web/src/lib/shared/styles/tokens.css` as CSS custom properties on
`:root`. The semantic names — `--paper`, `--paper-alt`, `--ink`,
`--ink-soft`, `--stone`, `--stone-lt`, `--rule`, `--sage`,
`--sage-bg`, `--ember`, `--ember-bg`, `--accent`, `--shadow` — match
the source object's keys; values are `oklch(...)` exactly as in the
JSX. No JS-side token table.

## R7. Theme: light / dark / system, device-local

`web/src/lib/shared/state/preferences.svelte.ts` exposes a runes-backed
singleton with a `theme: 'light' | 'dark' | 'system'` field, defaulting
to `'system'`. The chosen value is written to
`document.documentElement.dataset.theme` so the dark variant in
`tokens.css` (`:root[data-theme="dark"] { … }`) takes effect, and is
persisted to `localStorage` under key `cairn.theme` (the key
registered in `docs/architecture.md:253` and `docs/data-model.md:13`).
When `'system'`
is selected, a `@media (prefers-color-scheme: dark)` rule on
`:root:not([data-theme="light"]):not([data-theme="dark"])` picks up
the OS preference. The preference is device-local, not synced to
`user_settings` (`docs/ui.md:161-168`).

## R8. Font-size scale: five steps, applied as `rem` factor

`preferences.svelte.ts` also exposes
`fontSize: 'xs' | 's' | 'm' | 'l' | 'xl'`, defaulting to `'m'`. The
five steps map to scale factors `0.85 / 0.92 / 1.0 / 1.1 / 1.22`;
the chosen factor is written to a `--font-size-scale` CSS variable on
`:root`. All component CSS uses `rem` units that consume this scale
indirectly through `:root { font-size: calc(16px * var(--font-size-scale)); }`,
so changing the preference rescales the whole UI together
(`docs/ui.md:163-166`). The preference is persisted to `localStorage`
under key `cairn.font_size` (the key registered in
`docs/architecture.md:254` and `docs/data-model.md:14`).

## R9. Typography: Newsreader and JetBrains Mono, self-hosted

Newsreader (variable) and JetBrains Mono (variable) ship via the
`@fontsource-variable/newsreader` and
`@fontsource-variable/jetbrains-mono` npm packages, imported from
`web/src/lib/shared/styles/typography.css`. Fonts are self-hosted —
no external CDN — to honour the no-hyperscalers constraint
(`docs/architecture.md` "Considered and rejected"). The wordmark uses
Newsreader; the vote indicator (built in a later step) will use
JetBrains Mono.

## R10. Safe-area and viewport handling

`web/src/app.html` sets `<meta name="viewport"
content="width=device-width, initial-scale=1, viewport-fit=cover">`
and the page root layout is `100dvh` (not `100vh`).
`web/src/lib/shared/model/safe-area.ts` exports named constants for
the four `env(safe-area-inset-*)` strings so components don't repeat
the raw expression. `tokens.css` defines
`--fab-bottom: calc(env(safe-area-inset-bottom) + 16px)` and a matching
`--snackbar-bottom`. VisualViewport-based keyboard handling is **not**
in scope here — it gets its own state file (`keyboard.svelte.ts`) in a
later plan when the first text-input flow lands.

## R11. Back-stack utility for dismissible overlays

`web/src/lib/shared/state/back-stack.svelte.ts` exports
`pushHistoryGuard(onPop: () => void): () => void`. The function
pushes a marker state via `history.pushState`, registers a one-shot
`popstate` listener that calls `onPop` when the marker is popped, and
returns a cleanup function. Cleanup, when called for non-back reasons
(e.g. a Cancel button click), invokes `history.back()` itself so the
history stack stays aligned with the UI.

`Sheet.svelte` consumes the utility unconditionally — every sheet
is a dismissible overlay. `Accordion.svelte` consumes it only when
its caller opts in via the required `pushesHistory: boolean` prop
(see R13); the prop is mandatory, with no default, so every consumer
makes the call deliberately. The items-screen item panel passes
`true` (matching `docs/ui.md:146`); the lists-screen list-description
expand passes `false` because multiple descriptions can be open
simultaneously (`docs/ui.md:33`) and a single back press collapsing
all of them is the wrong UX.

The guard is installed by an `$effect` that runs **whenever `expanded`
is `true` and `pushesHistory` is `true`** — including on initial
mount with `expanded={true}`, not just on a false → true transition.
The natural `$effect(() => { if (expanded && pushesHistory) { … } })`
shape with a cleanup callback gives this behaviour for free.

Vitest must include at least one assertion that an overlay closes
in response to a synthetic `popstate` event; the canary lives on
`Accordion` with `pushesHistory={true}`, mounted with
`expanded={true}` so the guard is active at first paint.

## R12. Inlined icon primitive

`web/src/lib/basic/components/Icon.svelte` accepts a `name` prop and
renders an inline `<svg>` whose path comes from a static map in
`web/src/lib/basic/model/icon-paths.ts`. The icon set is the
Lucide-derived path subset already defined in
`design/cairn-ui.jsx:71-…`; ported verbatim. No runtime icon library
is added as a dependency.

## R13. Primitive components shipped in this step

The following components ship from this plan, each with a `.test.ts`
file co-located and (where mocked from elsewhere) a `__mocks__/`
counterpart:

- `basic/components/Button.svelte` — variants: `primary`, `ghost`,
  `destructive`. Destructive variant uses `--ember` and is reserved
  for genuinely destructive actions (`docs/ui.md:111`).
- `basic/components/Icon.svelte` — see R12.
- `basic/components/Sheet.svelte` — bottom-sheet primitive with an
  `open` prop, a `close` event, and back-stack integration per R11.
- `basic/components/Fab.svelte` — fixed-positioned floating action
  button. Bottom offset uses `--fab-bottom` per R10.
- `shared/components/TopBar.svelte` — left back arrow that always
  calls `history.back()` (never a hard-coded route, `docs/ui.md:145`),
  centred title slot, optional right slot.
- `shared/components/ButtonPair.svelte` — slot pair enforcing
  left = backward/destructive, right = forward/committal
  (`CLAUDE.md` "Conventions").
- `shared/components/Snackbar.svelte` — undo-style transient surface
  with a 6-second timer. **Does not** push history (`docs/ui.md:149`).
- `shared/components/Accordion.svelte` — expand/collapse with a
  **required** `pushesHistory: boolean` prop (no default — callers
  must pass `true` or `false` explicitly). When `true`, expand
  pushes a history marker and a `popstate` collapses the panel per
  R11; when `false`, expand/collapse is purely local state. Ships
  the Vitest back-stack canary assertion (with `pushesHistory={true}`)
  and a paired assertion that `pushesHistory={false}` does **not**
  call `pushHistoryGuard`.
- `shared/components/CairnGlyph.svelte` and
  `shared/components/CairnWordmark.svelte` — ported from
  `design/cairn-ui.jsx:38-67`.

## R14. Documentation: living spec + testing skill

This plan ships two new authoring artefacts so future sessions inherit
the conventions:

- **`docs/frontend-layout.md`** — new doc capturing R1–R5 in prose,
  with a worked example of "adding a new domain". Added to CLAUDE.md's
  Read-first list between `docs/data-model.md` and `docs/testing.md`.
- **`.claude/skills/writing-tests.md`** — new skill sibling to
  `writing-plan.md`, `writing-requirements.md`, `writing-tasks.md`,
  `writing-sql.md`. Codifies R5 (data-test attributes, no shared
  `beforeEach`, hybrid `__mocks__/`, MSW at network). Refers out to
  `docs/testing.md` for the pgTAP/Vitest/Playwright layer split
  rather than duplicating it. The name matches the project's
  existing `writing-*` family (writing skills, not slash commands —
  `.claude/commands/` holds the slash commands like `/work`,
  `/write-plan`, `/concerns`, and that's a separate directory with a
  different invocation contract).

`docs/testing.md` gets a one-paragraph cross-reference to both. The
deferred decisions (the three-layer mock aggregator and the hard
coverage gate) are recorded in `docs/open-questions.md`.

## Non-requirements (explicitly excluded)

- **Vote indicator and vote control** — defined in
  `design/cairn-ui.jsx` but belong to the `list` domain in master-plan
  step 4. The foundation provides the primitives they'll be built from.
- **Auth screens, magic-link UI, route guards** — master-plan step 3.
- **Avatar upload, image cropping, initials disc rendering** —
  master-plan step 5.
- **Settings screen content** — the Theme and Font-size preferences
  live in `preferences.svelte.ts` but the Settings screen that
  surfaces them is built later. The preferences API is the contract.
- **PWA manifest, service worker, install prompt** — master-plan
  step 11.
- **Legal screens** — master-plan step 12.
- **Playwright user-journey specs** — defined in `docs/testing.md`
  but ship alongside the flows they cover, starting in step 4. The
  back-stack pattern is verified by Vitest at this stage.
- **VisualViewport keyboard handling** — `docs/ui.md:131` mandates
  it, but no text-input flow lands until step 3 (auth). Implemented
  alongside the first input. The safe-area + 100dvh handling in R10
  covers everything except the keyboard case.
- **Three-layer mock aggregator** (`tests/mocks/lists/` per
  someday's `testing-structure.md`) — deferred to "if we feel the
  pain, revisit." Logged in `docs/open-questions.md`.
- **Hard 100% coverage gate** — deferred for the same reason. Review
  enforces what `docs/quality.md` already says: every public `src/lib/`
  function covered, every UI feature touched by Playwright (once
  Playwright comes online).
- **Choice between happy-dom and `@vitest/browser` + Playwright** —
  the existing config uses `happy-dom`; we stick with it for this
  step. If the back-stack tests or any primitive's DOM behaviour
  proves jsdom-flaky, we revisit. Logged in `docs/open-questions.md`.
