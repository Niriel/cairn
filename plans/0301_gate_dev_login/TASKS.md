# Tasks

## Reference skills and docs

- **`docs/development.md`** lines 265–307 — the canonical pattern for
  gating dev-only UI via literal `if (import.meta.env.DEV)` + dynamic
  `import()`. Code template lives here.
- **`docs/deployment.md`** lines 429–441 — "Auth surface: pre-deploy
  checklist". Names the three forbidden strings to grep for.
- **`docs/frontend-layout.md`** — `web/src/lib/` tier conventions
  and filename rules.
- **`docs/testing.md`** — three-layer testing convention; dev-shortcut
  is Vitest-only.

## Phase 0 — reconcile `docs/deployment.md`

### [ ] 0.1 Update "Auth surface: pre-deploy checklist" (DOC)

**Created:** 2026-05-21T12:04:34Z
**Completed:**

**Why:** `docs/deployment.md` lines 429–441 describe the bundle-leak as
current state ("the underlying code still ships in the prod client JS
bundle … grep the prod bundle for `alice@example.test` to see it") and
name the structural fix as future. Once this plan lands, that prose
contradicts reality. Cairn is pre-alpha; living docs that diverge from
shipped behaviour are a known trap (see CLAUDE.md → "Where we are in
the build"). Landing this doc edit *before* the code change is fine —
the doc-edit-first ordering means the doc is consistent with the code
at every commit.

**Prerequisites:** None.

**Decisions:**
- Rewrite the leak paragraph (currently "**However, the underlying
  code still ships in the prod client JS bundle.** …") in past tense:
  the previous behaviour, why it was decorative-not-exploitable, and
  the empirical grep that confirmed it.
- Drop item 3 (the `DEV_USERS` audit). Once the child module is
  excluded from the prod graph entirely, there's no `DEV_USERS`
  constant in the bundle to audit.
- Keep item 1 (server-side hardening of `/token?grant_type=password`)
  — unchanged; this is a GoTrue config concern independent of the
  client bundle.
- Keep item 2 (`VITE_DEV_LOGIN_PASSWORD` inlining) — Vite inlines
  `VITE_*` references as string literals at build time *before* DCE
  runs; if the child module were ever statically imported again, or if
  another caller of the env var were added, the value would re-leak.
  Worth keeping as a watch item, but tighten the wording to reflect
  that the structural fix has landed.
- Re-cast the "**The structural fix**" paragraph in past tense:
  "Landed in `plans/0301_gate_dev_login/` — see
  `docs/development.md` → 'Gating dev-only UI so it doesn't ship to
  prod' for the general pattern." Keep the cross-reference; remove
  the "Worth doing before public alpha" framing.

**Reference:** `docs/development.md` lines 265–307 — the canonical
gating pattern this plan implements; the deployment doc's structural-
fix paragraph should point readers here.

**Files:**
- `docs/deployment.md` (modify lines ~429–441)

**Steps:**
1. DOC — rewrite the section per Decisions above. Keep line count
   roughly the same; the section is part of the deployment checklist
   and should stay scannable.
2. DOC — run `pnpm format` from `web/` (Prettier owns `.md` per
   `docs/quality.md`) to confirm formatting.

**Verify:** manual read — section reads consistently with current
behaviour after this plan lands · `cd web && pnpm format:check`

## Phase 1 — extract `DevShortcuts.svelte`

### [ ] 1.1 Write `DevShortcuts.test.ts` (RED)

**Created:** 2026-05-21T12:04:34Z
**Completed:**

**Why:** Lock in the behaviour the extracted component must satisfy
before writing it. The tests are direct ports of the dev-only cases
that today live in
`web/src/lib/auth/components/LoginRequest.test.ts` (cases `(g)`,
`(i)`, `(k)`, `(l)`, `(m)`), rewritten against the child component
with controlled props and spied callbacks.

**Prerequisites:** None. The current
`web/src/lib/auth/components/LoginRequest.test.ts` is the reference
for what behaviour must be preserved.

**Decisions:**
- The child component's props contract is:
  ```ts
  type Props = {
    sending: boolean;
    setSending: (v: boolean) => void;
    onInlineError: (message: string) => void;
    onServerError: () => void;
  };
  ```
- The test mocks `$lib/auth/model/auth-client` (for
  `devPasswordSignIn` and `HttpError`) and
  `$lib/shared/state/session.svelte` (for `setSignedIn`). It does
  **not** mock `$lib/auth/model/dev-shortcut` — the runtime gate
  lives in the parent, not the child. The child assumes both gates
  passed when it was mounted, so it always renders the buttons.
- `vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'cairn-dev')` moves here
  from the parent test's `beforeAll`.
- Tests to include (one per case):
  - (g) the three buttons with `data-test="dev-login-{alice|bob|carol}"`
    render.
  - (i) clicking `dev-login-alice` calls
    `devPasswordSignIn('alice@example.test', 'cairn-dev')`, then
    `setSignedIn(returnedUser)`; invocation order asserted.
  - (j-child) when `sending` prop is `true`, all three buttons are
    `disabled`; when `false`, none are. (The parent-disables-child
    integration assertion stays in the parent test.)
  - (k) non-`HttpError` rejection (e.g. `TypeError('Failed to fetch')`)
    calls `onServerError()`, not `onInlineError`. `setSignedIn` not
    called.
  - (l) 4xx `HttpError` calls `onInlineError(err.message)`. No
    snackbar callback. No `setSignedIn`.
  - (m) 5xx `HttpError` calls `onServerError()`. No `onInlineError`.
    No `setSignedIn`.
  - In-flight gating: clicking the button calls `setSending(true)`
    before the await and `setSending(false)` in the `finally`; a
    second click while the in-flight promise is pending does not
    fire a second `devPasswordSignIn`. (This is the child-local
    half of the original `(j)`.)

**Reference:** existing parent tests in
`web/src/lib/auth/components/LoginRequest.test.ts` are the
behavioural reference. `web/src/lib/test/render.ts` exposes the
`render` helper plus `getByDataTest` / `queryByDataTest`.

**Files:**
- `web/src/lib/auth/components/DevShortcuts.test.ts` (create)

**Steps:**
1. RED — create the test file with the seven tests above. Mock
   `$lib/auth/model/auth-client` and
   `$lib/shared/state/session.svelte`. Stub
   `VITE_DEV_LOGIN_PASSWORD` in `beforeAll` and unstub in
   `afterAll`. Each test renders `DevShortcuts` with a fresh set
   of props (typically `sending=false` and four `vi.fn()` spies).
2. RED — run `cd web && pnpm test src/lib/auth/components/DevShortcuts.test.ts`
   and confirm every test fails because the component doesn't
   exist yet.

**Verify:** `cd web && pnpm test src/lib/auth/components/DevShortcuts.test.ts`

### [ ] 1.2 Create `DevShortcuts.svelte` (GREEN)

**Created:** 2026-05-21T12:04:34Z
**Completed:**

**Why:** Lift the dev-only UI out of `LoginRequest.svelte` into a
component that can be excluded from the prod bundle by a literal
`if (import.meta.env.DEV)` dynamic import. The parent rewire happens
in Phase 2; this task only creates the child and gets Task 1.1's
tests green.

**Prerequisites:** Task 1.1 (DevShortcuts.test.ts exists and is red).

**Decisions:**
- Component file at
  `web/src/lib/auth/components/DevShortcuts.svelte`, alongside its
  parent (per `docs/frontend-layout.md` — auth-domain UI lives in
  `auth/components/`).
- Props per Task 1.1. Use Svelte 5 `$props()`.
- The closure that lives in the child is `onDevLogin(devEmail)`,
  lifted from current `LoginRequest.svelte:58–74` verbatim except:
  - `sending` is read from props (no local `$state`); the
    short-circuit `if (sending) return` stays.
  - `setSending(true)` / `setSending(false)` replace direct
    assignments.
  - The 4xx branch calls
    `onInlineError(err.message || 'Sign-in failed. Check the dev password and try again.')`.
  - The 5xx / non-HttpError branch calls `onServerError()`.
  - `setSignedIn(user)` stays — only the child imports it now.
- `isHttpError400` helper moves with the closure (small, internal;
  identical to the parent's version).
- `DEV_USERS` constant moves verbatim.
- The `.dev-shortcuts` markup block from
  `LoginRequest.svelte:118–131` moves into the child's template,
  wrapped in a `<div class="dev-shortcuts">`.
- The `.dev-shortcuts` scoped style block from
  `LoginRequest.svelte:225–230` moves with it.
- Imports the child needs:
  - `Button` from `$lib/basic/components/Button.svelte`
  - `devPasswordSignIn`, `HttpError` from
    `$lib/auth/model/auth-client`
  - `setSignedIn` from `$lib/shared/state/session.svelte`

**Reference:** `LoginRequest.svelte` is the source of every line
moving here — keep the markup, the `data-test` attributes, and the
error wording identical so the test ports are mechanical.

**Files:**
- `web/src/lib/auth/components/DevShortcuts.svelte` (create)

**Steps:**
1. GREEN — create the file with `$props()` typed per Decisions, the
   `DEV_USERS` constant, the `isHttpError400` helper, the
   `onDevLogin` closure rewired against the prop callbacks, the
   markup block, and the scoped style.
2. GREEN — run `cd web && pnpm test src/lib/auth/components/DevShortcuts.test.ts`;
   confirm green.
3. GREEN — run `cd web && pnpm check` to confirm typing is clean
   (in particular, the `$props()` typing and the
   `import.meta.env.VITE_DEV_LOGIN_PASSWORD` read).

**Verify:** `cd web && pnpm test src/lib/auth/components/DevShortcuts.test.ts` · `cd web && pnpm check`

## Phase 2 — rewire `LoginRequest.svelte`

### [ ] 2.1 Trim and re-shape `LoginRequest.test.ts` (PREP)

**Created:** 2026-05-21T12:04:34Z
**Completed:**

**Why:** The parent's test suite currently covers dev-shortcut
behaviour directly. Now that the child component owns that behaviour
(verified in Task 1.1), the parent suite shrinks to non-dev cases
plus two cross-component integration tests that prove the parent's
in-flight `sending` state still gates the *other* component's
buttons, plus the runtime-gate negative case `(h)`. The dynamic
import is async, so those tests need to await the mount.

Labelled PREP rather than RED because the real RED happens implicitly
in Task 2.2 (deleting the inline buttons makes the synchronous
`getByDataTest` calls fail until the `await vi.waitFor` is in place).
This task prepares the test shape; 2.2 is the colour shift.

**Prerequisites:** Task 1.2 (`DevShortcuts.svelte` exists).

**Decisions:**
- Tests to delete (now owned by `DevShortcuts.test.ts`):
  `(g)`, `(i)`, `(k)`, `(l)`, `(m)`.
- Tests to keep verbatim: `(a)`, `(c)`, `(d)`, `(e)`, `(f)`,
  `(n)`. They don't touch the dev shortcut.
- Test to keep at the parent level — it covers the parent's
  runtime gate, which the child can't assert because the child
  assumes both gates already passed:
  - `(h)`: with `isDevLoginShortcutEnabled` mocked to `false`,
    `queryByDataTest('dev-login-alice|bob|carol')` returns `null`.
    Add a `vi.waitFor` / microtask flush after `render` to give the
    dynamic import a chance to resolve before asserting absence —
    otherwise the assertion passes trivially because the import
    hadn't completed yet, not because the gate works.
- Tests to update — these stay in the parent because they assert
  cross-component gating:
  - `(b)`: a magic-link send in flight disables `dev-login-alice`,
    `dev-login-bob`, `dev-login-carol`.
  - `(j)`: a dev-login click disables the magic-link submit and the
    other two dev buttons.
  Both need `await vi.waitFor(() => getByDataTest('dev-login-alice'))`
  before referencing the dev buttons, because the dynamic import
  resolves on a microtask. Vitest runs with `import.meta.env.DEV`
  true, so the import does fire.
- Drop the `vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', ...)` block (it
  moved to the child test). The parent no longer reads that env
  var directly.
- Keep the `vi.mock('$lib/auth/model/dev-shortcut', () => ({
  isDevLoginShortcutEnabled: vi.fn(() => false) }))` mock — the
  runtime gate still lives in the parent, and most tests need it
  off. Tests `(b)` and `(j)` continue to flip it on with
  `vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true)`.
- Keep the `vi.mock('$lib/shared/state/session.svelte')` line. The
  parent no longer references `setSignedIn` directly, but the child
  (loaded via dynamic import in test mode) does, and we want the
  parent suite isolated from real session state regardless of which
  components mount under it. The mock is cheap and future-proofs
  against accidental coupling.
- Drop the `devPasswordSignIn` import from the parent test file;
  it's only used by the child now.

**Reference:** `docs/quality.md` — `pnpm check` typing rules. The
test file should pass both `pnpm test` and `pnpm check`.

**Files:**
- `web/src/lib/auth/components/LoginRequest.test.ts` (modify)

**Steps:**
1. PREP — delete tests `(g)`, `(i)`, `(k)`, `(l)`, `(m)`. Keep
   `(h)` and add a `vi.waitFor` / microtask flush before the
   absence assertions so the dynamic import has had a chance to
   resolve.
2. PREP — update tests `(b)` and `(j)`: insert `await vi.waitFor(()
   => getByDataTest('dev-login-alice'))` immediately after `render`,
   and **move the existing `const alice = getByDataTest('dev-login-
   alice') as HTMLButtonElement` / `bob` / `carol` captures to *after*
   the `vi.waitFor`** so the synchronous lookups run once the child
   has mounted. Keep all other assertions identical.
3. PREP — remove the now-unused imports (`devPasswordSignIn`
   import, `VITE_DEV_LOGIN_PASSWORD` stub). Keep the
   `vi.mock('$lib/shared/state/session.svelte')` line.
4. PREP — run `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts`;
   expect tests `(b)` and `(j)` to fail because the parent still
   inlines the dev buttons synchronously (so the `vi.waitFor` either
   resolves immediately and proves nothing, or — once Task 2.2 is in —
   needs the await to find the async mount). The other tests should
   still pass.

**Verify:** `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts`

### [ ] 2.2 Rewire `LoginRequest.svelte` to dynamic-import the child (GREEN)

**Created:** 2026-05-21T12:04:34Z
**Completed:**

**Why:** Move the dev gate from runtime (`{#if}`) to build time
(literal `if (import.meta.env.DEV)` + dynamic `import()`), per
`docs/development.md` lines 285–304. Vite folds the `if` to `false`
in prod, the `import()` becomes dead code, and `DevShortcuts.svelte`
plus everything it transitively imports (the `DEV_USERS` constant,
`devPasswordSignIn`, the `VITE_DEV_LOGIN_PASSWORD` read, the
"Sign in as" template) drops from the prod bundle.

**Prerequisites:** Task 1.2 (child exists), Task 2.1 (parent tests
expect async mount).

**Decisions:**
- Replace the imports
  `devPasswordSignIn` and `setSignedIn` in
  `LoginRequest.svelte:6,11` with nothing — they're owned by the
  child now. Keep `sendMagicLink` and `HttpError` (still used by
  the magic-link path).
- Delete the `DEV_USERS` constant (lines 14–18) and the entire
  `onDevLogin` closure (lines 58–74) — they're in the child.
- Delete the `.dev-shortcuts` style block (lines 225–230).
- Replace the `{#if devShortcutEnabled}` block (lines 118–131) with
  a render of `<DevShortcuts>` driven by the dynamic-import
  pattern from `docs/development.md` lines 286–304. Concretely:

  ```svelte
  <script lang="ts">
    import type { Component } from 'svelte';
    // …existing imports, minus devPasswordSignIn and setSignedIn…

    let DevShortcuts: Component<{
      sending: boolean;
      setSending: (v: boolean) => void;
      onInlineError: (m: string) => void;
      onServerError: () => void;
    }> | null = $state(null);

    if (import.meta.env.DEV) {
      void import('./DevShortcuts.svelte').then((m) => (DevShortcuts = m.default));
    }

    const devShortcutEnabled = isDevLoginShortcutEnabled();
    // …existing state and handlers…
  </script>

  {#if DevShortcuts && devShortcutEnabled}
    <DevShortcuts
      {sending}
      setSending={(v) => (sending = v)}
      onInlineError={(m) => (inlineError = m)}
      onServerError={() => (errorSnack = true)}
    />
  {/if}
  ```
- Keep `isDevLoginShortcutEnabled` and its import — it's the
  runtime opt-in (`VITE_DEV_LOGIN_SHORTCUT`), still meaningful
  inside dev mode.
- The `{#if DevShortcuts && devShortcutEnabled}` block goes where
  the deleted `{#if devShortcutEnabled}` block used to be — inside
  the `.form`, after the `.hint` div.

**Reference:** `docs/development.md` lines 285–304 — code template
verbatim. `docs/quality.md` typing notes if `Component<...>` typing
trips svelte-check.

**Files:**
- `web/src/lib/auth/components/LoginRequest.svelte` (modify)

**Steps:**
1. GREEN — apply the imports/state/template edits above.
2. GREEN — run `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts`;
   confirm all parent tests pass (including the now-async `(b)` and
   `(j)`).
3. GREEN — run `cd web && pnpm check`.

**Verify:** `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts` · `cd web && pnpm check`

## Phase 3 — verify the prod bundle and close out

### [ ] 3.1 Bundle grep + full check, tick the master plan

**Created:** 2026-05-21T12:04:34Z
**Completed:**

**Why:** R1 is the load-bearing requirement and the only one not
covered by unit tests. The acceptance evidence is a `pnpm build`
followed by grep against `web/build/_app/immutable/` showing zero
matches for the three forbidden strings. Then run the full check
gauntlet to catch any regression across lint / type / pgTAP /
Vitest / Playwright.

**Prerequisites:** Task 2.2 (parent is rewired).

**Decisions:**
- The forbidden strings (per `docs/deployment.md` line 431 plus
  the env-var leak called out in item 2):
  - `alice@example.test`
  - `Sign in as`
  - `grant_type=password`
  - `cairn-dev` (the value of `VITE_DEV_LOGIN_PASSWORD` in local
    `.env.development` — Vite inlines `VITE_*` references as string
    literals at build time, so this is what would actually leak if
    dead-code-elimination ever failed)
- Search root is `web/build/_app/immutable/` (the JS/CSS chunk
  directory; SvelteKit's static adapter writes here).
- Tick the matching `0301` checkbox in
  `plans/0000_implementation_order.md` in the same commit that
  closes the work. Commit message domain: `feat(auth):` (the user
  visible change is in the auth surface) or `chore(auth):` (the
  prod-only behavioural delta is "bundle no longer contains dev
  strings", which is closer to a chore). Pick `feat(auth):` —
  it's the right home for the new component and the gate change.

**Reference:** `docs/deployment.md` lines 429–441 — the three
grep strings and the rationale. `scripts/check.sh --e2e` for the
full layer pass.

**Files:**
- `plans/0000_implementation_order.md` (modify — tick `0301`)
- `plans/0301_gate_dev_login/TASKS.md` (modify — tick this task's
  checkbox, fill `Completed:` timestamps across all six tasks as
  each lands)

**Steps:**
1. GREEN — `cd web && pnpm build`.
2. GREEN — run each grep; confirm zero matches:
   ```bash
   grep -r 'alice@example.test'   web/build/_app/immutable/
   grep -r 'Sign in as'           web/build/_app/immutable/
   grep -r 'grant_type=password'  web/build/_app/immutable/
   grep -r 'cairn-dev'            web/build/_app/immutable/
   ```
   If any matches: the dynamic-import gate isn't doing its job —
   stop, diagnose (most likely culprit: a static import from
   `LoginRequest.svelte` still pulls a module that re-exports a
   dev string, or `auth-client.ts` got imported in a way that
   defeats tree-shaking).
3. GREEN — `./scripts/check.sh --e2e` from the repo root.
4. GREEN — tick the `0301` checkbox in
   `plans/0000_implementation_order.md` (lines 69–83).

**Verify:** `cd web && pnpm build && grep -rE 'alice@example.test|Sign in as|grant_type=password|cairn-dev' web/build/_app/immutable/ || echo 'clean'` · `./scripts/check.sh --e2e`
