# Plan: gate the dev-login shortcut so it doesn't ship to prod

Extract the dev-login UI out of `LoginRequest.svelte` into a child
component loaded via a literal `if (import.meta.env.DEV)` dynamic
import. Vite folds the `if` to `false` in prod, the `import()` becomes
dead code, and the child module plus its transitive imports drop from
the prod bundle. The current `{#if devShortcutEnabled}` block doesn't
strip — empirically, `pnpm build` ships the seed emails and password
helper into `web/build/_app/immutable/`. This must land before step 13
(deploy).

## Context

The login screen at `web/src/lib/auth/components/LoginRequest.svelte`
renders three "Sign in as alice/bob/carol" buttons gated by an
`{#if isDevLoginShortcutEnabled()}` block (lines 118–131). The block
imports `devPasswordSignIn` from `$lib/auth/model/auth-client`, holds a
`DEV_USERS` constant with three `.example.test` emails, and reads
`import.meta.env.VITE_DEV_LOGIN_PASSWORD` at click time.

Svelte compiles `{#if}` to runtime logic — even when the condition is
statically `false` after Vite's `import.meta.env.DEV` replacement, the
minifier cannot prove the branch is dead across the component boundary.
The template strings, closures, and any module imported only for that
branch survive into the prod bundle. Confirmed empirically: after
`pnpm build`, `grep -r 'alice@example.test' web/build/_app/immutable/`
matches.

Not exploitable today (`/token?grant_type=password` is a server-side
attack surface either way; whether the client bundle ships a helper is
decorative), but cosmetically wrong and called out as the structural
fix in `docs/deployment.md` → "Auth surface: pre-deploy checklist"
lines 429–441. The general pattern this implements — literal
`if (import.meta.env.DEV)` plus dynamic `import()` — is documented in
`docs/development.md` → "Gating dev-only UI so it doesn't ship to
prod" lines 265–307.

## Decisions

**Child owns the dev code; parent owns the shared form state.** The
new `DevShortcuts.svelte` holds the `DEV_USERS` constant, the
`onDevLogin` handler, the `devPasswordSignIn` import, the `setSignedIn`
import, and the `import.meta.env.VITE_DEV_LOGIN_PASSWORD` read. The
parent keeps `sending`, `inlineError`, and `errorSnack` as `$state`
because R3 requires a single unified in-flight gate and a single
error-render path. State flows down via props:

```ts
type Props = {
	sending: boolean;
	setSending: (v: boolean) => void;
	onInlineError: (message: string) => void;
	onServerError: () => void;
};
```

`$bindable` was considered and rejected — splitting ownership of three
pieces of state across two files for a single dev-only consumer is
heavier than four small props.

**Both gates remain.** The new build-time gate
(`if (import.meta.env.DEV)` around the dynamic import) and the existing
runtime gate (`isDevLoginShortcutEnabled()` reading
`VITE_DEV_LOGIN_SHORTCUT`) serve different jobs: the first strips the
module from prod; the second lets a dev contributor opt out of the
buttons in their local session. The parent checks both before
rendering `<DevShortcuts>`.

**`devPasswordSignIn` stays in `auth-client.ts`.** Tree-shaking handles
the prod-drop: after the refactor only `DevShortcuts.svelte` imports
it, and `DevShortcuts.svelte` itself is excluded from prod by the
dynamic-import gate, so Vite's tree-shaker drops the helper. Splitting
it into its own module would be cosmetic.

**Test split mirrors the code split.** The Vitest tests that cover
dev-shortcut behaviour (currently `(g)`–`(m)` in
`LoginRequest.test.ts`) move to a new `DevShortcuts.test.ts` and exercise
the extracted component directly, with controlled props and spied
callbacks. Two cross-component integration tests stay in the parent
suite — `(b)` and `(j)` — because they assert that the parent's
`sending` gate disables the _other_ component's buttons; those are
exactly the behaviours the split risks breaking, so they're the ones
worth keeping at the parent level. The dynamic import resolves
asynchronously, so those two tests gain an `await vi.waitFor(...)` for
the dev buttons to appear.

## Architecture

### New files

- **`web/src/lib/auth/components/DevShortcuts.svelte`** — owns
  `DEV_USERS`, `onDevLogin`, the `devPasswordSignIn` + `setSignedIn`
  imports, the `VITE_DEV_LOGIN_PASSWORD` read, the `.dev-shortcuts`
  markup, and the scoped styles. Receives `sending` + three callbacks
  from the parent.
- **`web/src/lib/auth/components/DevShortcuts.test.ts`** — Vitest
  unit tests for the extracted component. Inherits tests `(g)`,
  `(i)`, `(k)`, `(l)`, `(m)` from the parent suite, rewritten against
  the child with controlled props.

### Modified files

- **`web/src/lib/auth/components/LoginRequest.svelte`** — drops
  `DEV_USERS`, `onDevLogin`, the `devPasswordSignIn` and `setSignedIn`
  imports, and the `.dev-shortcuts` styles. Adds the `let
DevShortcuts = $state(null)` + `if (import.meta.env.DEV) { void
import('./DevShortcuts.svelte').then(...) }` dynamic-import block,
  and renders `<DevShortcuts ... />` when both gates allow.
- **`web/src/lib/auth/components/LoginRequest.test.ts`** — drops
  tests `(g)`, `(i)`, `(k)`, `(l)`, `(m)`; keeps `(a)`, `(c)`,
  `(d)`, `(e)`, `(f)`, `(h)`, `(n)`; updates `(b)`, `(h)`, and
  `(j)` to await the async dev-button mount (`(b)` and `(j)`
  via `vi.waitFor(() => getByDataTest('dev-login-alice'))`; `(h)`
  via a microtask flush before asserting absence, so a trivially-
  passing pre-mount assertion doesn't mask a broken gate). Drops
  the `vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', ...)` block (moves to
  the child test).
- **`docs/deployment.md`** — update the "Auth surface: pre-deploy
  checklist" section (lines 429–441) to reflect the post-fix reality.
  See Phase 0 / Task 0.1.
- **`plans/0000_implementation_order.md`** — tick the `0301`
  checkbox in the same commit that lands the bundle change.

### Data flow

```
LoginRequest.svelte (parent — always shipped)
├── owns: sending, inlineError, errorSnack
├── handles: magic-link send (sendMagicLink → setPendingLogin → goto)
└── dev branch (DEV-only, stripped in prod)
     dynamic import './DevShortcuts.svelte'
     │
     ▼
     DevShortcuts.svelte (child — DEV only)
     ├── owns: DEV_USERS, onDevLogin
     ├── reads props: sending
     ├── invokes callbacks: setSending, onInlineError, onServerError
     ├── imports: devPasswordSignIn, setSignedIn
     └── reads: VITE_DEV_LOGIN_PASSWORD
```

## Phase structure

The ordering is RED-before-GREEN within each unit. Phase 0 reconciles
the deployment doc with the post-fix reality; Phase 1 lands the child
component with its own tests; Phase 2 rewires the parent to use it and
trims the parent suite; Phase 3 closes the loop with the bundle-grep
verification.

0. **Phase 0 — doc reconciliation.** `docs/deployment.md` lines
   429–441 describe the bundle-leak problem as current state and name
   the structural fix as future ("Worth doing before public alpha").
   Once this plan lands, that prose is wrong. Update the section to
   reflect the post-fix reality: rewrite the leak description in past
   tense, drop item 3 (the `DEV_USERS` audit — moot once the module is
   excluded from the prod graph), keep items 1 (server-side hardening
   of `/token?grant_type=password`) and 2 (`VITE_DEV_LOGIN_PASSWORD`
   inlining — still meaningful because Vite inlines the value
   regardless of DCE), and re-cast the "structural fix" paragraph in
   past tense referencing this plan. See Task 0.1.
1. **Phase 1 — extract `DevShortcuts.svelte`.** RED: write
   `DevShortcuts.test.ts` against an as-yet-unwritten component
   (tests `(g)`/`(i)`/`(k)`/`(l)`/`(m)` rewritten against the child).
   GREEN: create `DevShortcuts.svelte` with the props contract from
   Decisions; lift the markup, handler, imports, and styles from
   `LoginRequest.svelte` into it. The parent is _not yet_ rewired —
   the child is verified in isolation. See Tasks 1.1–1.2.
2. **Phase 2 — rewire `LoginRequest.svelte` and trim its tests.**
   RED: update `LoginRequest.test.ts` — drop the dev-only unit tests
   that moved to the child, update `(b)` and `(j)` for async mount.
   GREEN: in `LoginRequest.svelte`, strip the inlined dev code, add
   the dynamic import, render `<DevShortcuts>` under the dual gate.
   See Tasks 2.1–2.2.
3. **Phase 3 — verify the prod bundle.** Build, grep, confirm the
   three forbidden strings are absent (R1). Run `./scripts/check.sh
--e2e` for the full layer pass (R5). Tick `0301` in
   `plans/0000_implementation_order.md`. See Task 3.1.

## Reference docs and skills

- **`docs/development.md`** lines 265–307 — the canonical
  "Gating dev-only UI so it doesn't ship to prod" pattern this plan
  implements verbatim.
- **`docs/deployment.md`** lines 429–441 — "Auth surface: pre-deploy
  checklist", which names this fix and the three watch items it
  closes.
- **`docs/frontend-layout.md`** — confirms `DevShortcuts.svelte`
  belongs in `web/src/lib/auth/components/` alongside its parent
  (domain-specific, not cross-cutting).
- **`docs/testing.md`** — three-layer testing convention; Vitest
  is the right layer here, no pgTAP or Playwright changes needed.

## Open questions

None. The pattern is fully specified in `docs/development.md`; the
extraction surface in `LoginRequest.svelte` is small and contained.
