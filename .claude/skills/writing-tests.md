---
name: writing-tests
description: Conventions for Vitest component and unit tests in Cairn — data-test DOM queries, hybrid __mocks__ convention, Svelte 5 runes idiom in mocks, no shared beforeEach, MSW at the network layer.
paths: web/**/*.test.ts
---

# Writing tests

Conventions for the Vitest layer of Cairn's test pyramid — component
and unit tests under `web/src/`. Read this before writing the first
`*.test.ts` in a session; the rules below are project-specific and
don't fall out of `vitest`'s defaults.

Canonical references: `docs/testing.md` (three-layer pyramid: pgTAP /
Vitest / Playwright), `docs/frontend-layout.md` (tree shape, filename
rules, mock placement), `web/src/lib/test/render.ts` (the helper
every component test imports).

## When to use this skill

- Writing or modifying a `*.test.ts` file under `web/src/`.
- Adding or editing a `__mocks__/` entry next to a component or
  runes module.
- Investigating a flaky or accidentally-passing Vitest red.

This skill covers the Vitest layer only. Playwright lives under
`web/e2e/` and has different ergonomics; pgTAP is `docs/testing.md`
and `.claude/skills/writing-sql.md`.

## Tests next to SvelteKit route files drop the `+`

Colocated tests for `+page.svelte` / `+layout.svelte` / `+error.svelte`
are named **without** the `+` prefix: `page.test.ts`, `layout.test.ts`,
`error.test.ts`. SvelteKit's manifest scanner rejects any `+`-prefixed
file in `src/routes/` whose name isn't a recognized route kind, so
`+page.test.ts` fails `svelte-kit sync` (and therefore `pnpm check`).
Vitest globs `src/**/*.test.ts` regardless of the prefix, so the test
stays colocated next to the route file without `+`. Full rule in
`docs/frontend-layout.md` → "Filename conventions".

## DOM queries — `data-test` only

Every queryable element in a component carries a `data-test="…"`
attribute. Tests reach for elements through the helper at
`web/src/lib/test/render.ts`:

- `getByDataTest(name)` — returns the element, throws if zero or
  multiple matches.
- `queryByDataTest(name)` — returns the element or `null`.
- `getAllByDataTest(name)` — returns the array.

No `getByText`, no `getByRole`, no `querySelector('.btn-primary')`.
CSS classes and text content change every time the design moves;
`data-test` is the deliberate test surface and only the
`render.ts` helpers know how to consume it, which keeps the
convention enforced at the API level.

## Mocks (hybrid `__mocks__/`)

Vitest's automock convention is the default: a bare
`vi.mock('$lib/path/Foo.svelte')` (no factory argument) loads
`__mocks__/Foo.svelte` from the directory next to the source. A
co-located `__mocks__/<exact-source-filename>` is **required** for
any source mocked from more than one test — duplicating an inline
factory across files is drift in slow motion. Inline
`vi.mock(path, factory)` is fine for one-offs where the mock is
specific to a single test's setup.

`vi.mock(path)` is hoisted to the top of its file and applies to the
module's whole import graph for that file — you cannot toggle it
between tests. If some cases need the real implementation and others
need the mock, **split into two test files**. Example:
`Accordion.test.ts` exercises cases that need the real
`back-stack.svelte` module (the popstate canary); the
`pushesHistory={false}` case that mocks the module to assert zero
calls lives in `Accordion.no-push.test.ts`. A single file mixing
both intents silently reads one implementation and corrupts the
other case's expectations.

Mock files use the Svelte 5 runes idiom — `let { children, ...rest } =
$props()` and `{@render children?.()}` — never `<slot />`. The compat
layer accepts `<slot />`, but no real Cairn component uses it; a mock
that uses `<slot />` quietly diverges from the API it stands in for
and you'll spend an afternoon working out why a parent renders
nothing in tests.

## No shared `beforeEach` for mock state

Each test sets up the mocks it needs, inside the test:
`vi.spyOn(module, 'fn').mockReturnValue(...)` per-test. Shared
`beforeEach`-at-file-scope or describe-scope mock setup is forbidden
— hidden setup is the most reliable source of "passes alone, fails
in the suite" Heisenbugs. A test that reads as if it tests one thing
but secretly relies on a `beforeEach` four screens up is a debugging
trap.

The narrow exception is **harness-lifecycle** cleanups in
`vitest.setup.ts`: RTL's `cleanup()` after each test and MSW's
`server.resetHandlers()` between tests. Those aren't shared _mock
state_ — they're tearing the harness back down to a known floor so
the next test starts clean. That's the only legitimate use of a
`beforeEach`-style hook at file or suite scope.

## Testing reactive runes state

Svelte coalesces same-value assignments to `$state` — re-assigning
a property to the value it already holds is a no-op, and the
`$effect` chain does **not** fire. A `beforeEach` that resets state
between tests often hits this: one test sets
`preferences.theme = 'dark'`, the effect writes `'dark'` to
localStorage, `beforeEach` then assigns
`preferences.theme = 'system'` and clears localStorage — but if the
test happened to _start_ with `theme === 'system'`, the reset's
effect never ran, the clear deletes nothing the effect wrote, and
the next test's assertion fails mysteriously.

The fix is to flush the reset's effect _before_ clearing downstream
state. Make `beforeEach` `async`, assign the reset value,
`await tick()`, then clear:

```ts
beforeEach(async () => {
	preferences.theme = "system";
	preferences.fontSize = "m";
	await tick();
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
});
```

The `await tick()` is load-bearing — without it the reset's effect
can land _after_ your clear and leak into the next test.

### Store tests that trigger async fetches

`await tick()` flushes Svelte's reactive queue — it does not wait
for Promises started _inside_ an effect. If the effect under test
calls `pgGet` (or any other async operation), `tick()` alone is not
enough: after it returns, the fetch is in flight but not yet
resolved.

Pattern: `tick()` to fire the effect, then `vi.waitFor()` to poll
until the async work lands:

```ts
sessionMod.setSignedIn({ id: TEST_UID, email: "dev@example.test" });
await tick(); // fires the $effect
await vi.waitFor(() => {
	expect(profileMod.profile.displayName).toBe("Alice");
});
```

`vi.waitFor` retries the assertion on each microtask until it passes
or the 1 s default timeout elapses — far more reliable than a fixed
`setTimeout` delay.

When testing that the store _resets_ after a synchronous transition
(e.g. sign-out sets `displayName = null` directly, without a fetch),
`await tick()` alone is sufficient for that assertion.

## HTTP at the network layer (MSW)

Component tests use MSW to intercept `fetch` and return canned
PostgREST responses. Handlers live in `web/src/lib/test/handlers.ts`
and are wired up by `vitest.setup.ts`. Per-test, override individual
handlers with `server.use(...)` for the scenario under test.

We deliberately mock at the network boundary rather than at a "fake
API client" abstraction. The API client can be refactored without
touching every test, and the mock responses are real PostgREST-
shaped JSON so off-by-one shape bugs surface in the unit layer
instead of waiting for Playwright.

## What tests assert

Props in, events / rendered output / state changes out. Not
internals.

- "Click the primary action button → `onsubmit` is called with the
  current input value."
- "When `loading={true}` is passed, the spinner has
  `data-test='spinner'`."
- "When the user types in the search box, the listed items reactive
  state filters by prefix."

Not: "The component imports `someHelper`." Not: "The internal
`count` variable equals 3." Not: "The Button has class `primary`."
(Exception: a class that doubles as the styling hook the scoped
`<style>` block targets — like the `primary` / `ghost` / `destructive`
variant class on `Button` — is part of the API surface, so asserting
it is fine. Avoid asserting on classes that exist only as visual
sugar.)

A test that grips an internal name breaks on every refactor and
verifies nothing the user cares about.

## Deferred

Two test-architecture decisions are deferred until the trigger
arrives — both indexed in `docs/open-questions.md`:

- **Three-layer mock aggregator** (`tests/mocks/lists/`-style
  shared mock libraries). Default: no aggregator; co-located
  `__mocks__/` is enough. Trigger: the same `vi.mock(...)`
  declarations repeating in five-plus test files.
- **Hard coverage gate** (a numeric threshold enforced in CI).
  Default: review-enforced per `docs/quality.md`. Trigger: a
  regression at the same component or function twice within a
  release cycle.

Don't introduce either silently; if the trigger fires, open the
open-question entry and decide explicitly.
