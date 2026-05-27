# Frontend layout

This document is the canonical reference for how the SvelteKit web app
under `web/src/lib/` is organised: which directories exist, what may live
in each, how files are named, where tests and mocks sit, and how a new
domain is added. The runtime architecture (PWA, static bundle, no
hyperscalers) lives in `docs/architecture.md`; the test pyramid (pgTAP /
Vitest / Playwright) lives in `docs/testing.md`. This file is about the
shape of the frontend tree only.

The rule it enforces is simple: every Cairn frontend file has one
obvious home, and a sibling domain can never see another sibling
domain's internals.

## Where things live

The `web/src/lib/` tree is split into three tiers. Imports may flow
inward but never sideways at the leaf tier.

- **`basic/`** — framework-agnostic primitives. Components in here know
  nothing about Cairn's data model, auth state, routes, or any other
  business concern. They are the parts you would lift wholesale into
  any other Svelte project: `Button`, `Icon`, `Sheet`, `Fab`. If a
  component needs to import from `$lib/auth/` or knows what a "list"
  is, it does not belong here.
- **`shared/`** — Cairn-aware cross-cutting code that more than one
  domain consumes. The `TopBar` (knows about the Cairn back-stack
  pattern from `docs/ui.md`), the `Snackbar` (the undo surface used by
  every destructive flow), the `CairnGlyph` and `CairnWordmark`,
  theme/font-size preference state, the `pushHistoryGuard` back-stack
  utility. Anything in here may import from `basic/` but not from a
  per-domain folder.
- **Per-domain folders** — `auth/`, `list/`, `avatar/`, `settings/`,
  `invites/`, `circles/`, and so on. Each owns one slice of the
  product. A domain folder may import from `basic/` and `shared/`,
  but **never from a sibling domain**. If two domains need the same
  thing, it gets promoted to `shared/` (or `basic/` if it has no
  Cairn-specific knowledge); it does not get reached for across the
  fence.

The import direction is one-way: `basic/ ← shared/ ← domains`. A
sideways import between sibling domains is the signal that something
needs to move up a tier.

## Domain folder shape

Inside `basic/`, `shared/`, and every per-domain folder, the same
three subfolders carry the same meanings:

- **`components/`** — Svelte components (`*.svelte`). One component
  per file. Tests sit next to the source.
- **`state/`** — `.svelte.ts` runes modules. Anything that holds
  reactive state (`$state`, `$derived`) or runs `$effect.root(...)`
  at module load lives here. Plain helper TypeScript that happens to
  be consumed by reactive code does not — that goes in `model/`.
- **`model/`** — non-reactive TypeScript: types, validators, pure
  helpers, lookup tables, named constants. No Svelte imports, no
  runes. This is the layer that other layers can freely import
  without dragging the reactivity system in.

A `views/` subfolder is reserved for page-level wrappers in domains
that have several variants of a single screen; it is usually omitted
because page-level components live in `src/routes/` as SvelteKit
routes, not in `$lib/`.

The tree at a glance:

```
web/src/lib/
├── basic/
│   ├── components/
│   │   ├── Button.svelte
│   │   ├── Button.test.ts
│   │   ├── __mocks__/
│   │   │   └── Button.svelte
│   │   └── …
│   └── model/
│       └── icon-paths.ts
├── shared/
│   ├── components/
│   │   ├── TopBar.svelte
│   │   ├── TopBar.test.ts
│   │   └── AppTopBar.svelte
│   ├── state/
│   │   ├── preferences.svelte.ts
│   │   ├── preferences.test.ts
│   │   └── __mocks__/
│   │       └── preferences.svelte.ts
│   ├── model/
│   │   └── safe-area.ts
│   └── styles/
│       ├── tokens.css
│       ├── reset.css
│       └── typography.css
├── auth/
│   └── …
├── list/
│   └── …
└── test/
    ├── render.ts
    ├── handlers.ts
    └── server.ts
```

`shared/styles/` is a special case: a styles-only folder under
`shared/` for the three root CSS files (tokens, reset, typography)
imported once from `src/routes/+layout.svelte`. It does not need a
`components/`, `state/`, or `model/` sibling because nothing in it is
code in the usual sense.

`lib/test/` is the test harness itself (the `render` helper,
`@testing-library/svelte` wrappers, MSW handlers, the MSW server) and
is not a domain — it is the toolkit the test files use.

## Filename conventions

- **Components** — `PascalCase.svelte` (`Button.svelte`,
  `CairnGlyph.svelte`, `TopBar.svelte`).
- **Runes modules** — `kebab-case.svelte.ts`
  (`preferences.svelte.ts`, `back-stack.svelte.ts`). The `.svelte.ts`
  suffix is what tells Vite to apply the Svelte compiler so the runes
  are recognised; missing it gives a confusing "cannot use $state
  outside a component" error.
- **Plain TS modules** — `kebab-case.ts` (`safe-area.ts`,
  `icon-paths.ts`).
- **Tests** — `<Name>.test.ts` next to the source.
  `Button.svelte` → `Button.test.ts`. `preferences.svelte.ts` →
  `preferences.test.ts` (the test file is plain TS even when the
  source is `.svelte.ts`).
- **Tests next to a SvelteKit route file** — drop the `+` prefix.
  `+page.svelte` → `page.test.ts`. `+layout.svelte` → `layout.test.ts`.
  SvelteKit's manifest scanner rejects any `+`-prefixed file under
  `src/routes/` whose name isn't a recognized route kind (`+page.svelte`
  / `+page.ts` / `+page.server.ts` / `+layout.*` / `+error.svelte` /
  `+server.ts`); a colocated `+page.test.ts` fails `svelte-kit sync`
  (and therefore `pnpm check`). The walker short-circuits on any file
  that doesn't start with `+`, so `page.test.ts` next to `+page.svelte`
  is invisible to the route manifest while Vitest still picks it up
  via its `src/**/*.test.ts` glob. The collision risk — a `page.svelte`
  *and* a `+page.svelte` in the same folder — is real but vanishingly
  rare; one route component per folder is the convention.
- **Mocks** — under `__mocks__/` next to the source, with the exact
  source filename: `__mocks__/Button.svelte`,
  `__mocks__/preferences.svelte.ts`.

## Mocks (hybrid)

We use the Vitest automock convention. When a test calls
`vi.mock(path)` without a factory, Vitest looks for a file at
`__mocks__/<basename>` next to the source and uses that.

```ts
// In a test file:
vi.mock('$lib/basic/components/Icon.svelte');
// Vitest loads web/src/lib/basic/components/__mocks__/Icon.svelte
```

A `__mocks__/<name>` file is **required** for any source that is
mocked from more than one test — duplicating an inline factory across
files is what drift looks like in slow motion. Inline
`vi.mock(path, factory)` is allowed for one-offs where the mock is
specific to a single test's needs.

Mock files for components must match the runes idiom used by their
source: components in this codebase render their children via
`let { children, ...rest } = $props()` and `{@render children?.()}`.
Mock files use the same form. `<slot />` is legacy Svelte 4 syntax
that the compat layer still accepts but no real Cairn component uses;
mocks that reach for `<slot />` quietly diverge from the surface
they're meant to stand in for, so don't write them that way.

## Svelte reactive collections

Use `SvelteSet` and `SvelteMap` (from `svelte/reactivity`) instead of plain `Set` / `Map` whenever the collection is read in a template or a `$derived`. The linter (`svelte/prefer-svelte-reactivity`) enforces this.

**Do not wrap `SvelteSet` / `SvelteMap` in `$state()`** — they are already reactive. The linter will flag this as `svelte/no-unnecessary-state-wrap`. Declare them as `const` and mutate in place:

```ts
const expandedIds = new SvelteSet<string>(); // ✓ const, not $state(new SvelteSet())

$effect(() => {
  void someReactiveDep; // read a reactive value to subscribe; use void to suppress no-unused-vars
  expandedIds.clear();
  for (const id of computeIds()) expandedIds.add(id);
});
```

When you need a Set computed from reactive inputs (not mutated), use `$derived`:

```ts
const expandedIds = $derived(new Set(someArray.map((x) => x.id)));
```

## Testing rules

Component tests assert what the user sees — props in, rendered output
or events or state changes out. They don't reach into private
internals. DOM queries go through the `data-test` attribute via the
`render` helper at `web/src/lib/test/render.ts` (`getByDataTest`,
`queryByDataTest`, `getAllByDataTest`). The full rules — no shared
`beforeEach`, MSW at the network layer, the hybrid `__mocks__/`
convention — live in `.claude/skills/writing-tests.md`, which fires
whenever a Cairn session writes a test. The three-layer pyramid
(pgTAP / Vitest / Playwright) is in `docs/testing.md`.

## Adding a new domain — worked example

Say `circles/` doesn't exist yet and a plan needs it. The first time
a circles-aware component lands:

1. Create `web/src/lib/circles/`.
2. Create the subfolders the first task needs — typically
   `components/` and `state/`. Don't pre-create empty folders for
   tiers you aren't using yet; `model/` shows up when the first plain
   helper lands.
3. Drop the first component and its test into `components/`:
   `web/src/lib/circles/components/CircleBadge.svelte` and
   `CircleBadge.test.ts`.
4. If `CircleBadge` will be mocked by more than one downstream test,
   add `web/src/lib/circles/components/__mocks__/CircleBadge.svelte`
   at the same time.
5. If the circles UI needs reactive state shared across components
   (selected circle, pending edits), it goes in
   `web/src/lib/circles/state/<name>.svelte.ts`.
6. Imports inside `circles/` reach for `$lib/basic/...` and
   `$lib/shared/...` freely; they do not reach into a sibling
   domain. If they need to, the shared piece moves up to `shared/`
   first, then `circles/` consumes it from there.

The same pattern applies in reverse when an existing folder graduates:
something `basic/` had to itself eventually grows a Cairn-specific
sibling and gets promoted to `shared/`, or a piece of `shared/` turns
out to be domain-specific after all and moves into the domain that
actually uses it. These promotions are cheap to do as long as the
import direction stays one-way, which is the whole point of the
tier split.
