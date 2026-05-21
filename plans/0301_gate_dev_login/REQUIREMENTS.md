# Requirements: gate the dev-login shortcut so it doesn't ship to prod

The login screen carries three "Sign in as alice/bob/carol" buttons that
exist purely to skip the magic-link round-trip during local development.
The buttons are gated by a Svelte runtime `{#if}`, which hides them in prod
but does **not** drop the supporting code from the prod JS bundle —
`pnpm build` followed by `grep` confirms the seed emails, the "Sign in as
…" template fragment, and the `devPasswordSignIn` helper land in
`web/build/_app/immutable/`. This work moves the gate from runtime to
build time so the prod bundle no longer carries dev-only code. It must
land before step 13 (deploy).

## R1. Dev-shortcut code is physically absent from the prod bundle

After `pnpm build` in `web/`, none of the following appears anywhere under
`web/build/_app/immutable/`:

- The three seed emails (`alice@example.test`, `bob@example.test`,
  `carol@example.test`).
- The "Sign in as " template fragment.
- The `devPasswordSignIn` helper, including its `/token?grant_type=password`
  URL and its `VITE_DEV_LOGIN_PASSWORD` env read.
- The value of `VITE_DEV_LOGIN_PASSWORD` itself (`cairn-dev` in local
  `.env.development`). Vite inlines `import.meta.env.VITE_*` references
  as string literals at build time; if dead-code-elimination ever fails
  to drop the child module, the password value is what would leak. See
  `docs/deployment.md` "Auth surface: pre-deploy checklist" item 2.

"Hidden by an `{#if}` whose condition is constant-false in prod" is not
sufficient — the bytes must not be in the deployed JS at all. Verification
is by grep against `web/build/_app/immutable/` (see PLAN.md → Phase 3).

## R2. Dev shortcut still works in dev under the existing runtime gate

In a `pnpm dev` (or `pnpm preview` from a dev-mode build) session with
`VITE_DEV_LOGIN_SHORTCUT=true` and `VITE_DEV_LOGIN_PASSWORD` set, the
three buttons render and behave exactly as today: clicking "Sign in as
alice" calls `devPasswordSignIn('alice@example.test', <password>)`
against GoTrue's `/token?grant_type=password`, calls
`setSignedIn(user)` on success, surfaces 4xx errors inline and 5xx /
network errors via the snackbar.

`isDevLoginShortcutEnabled()` and the `VITE_DEV_LOGIN_SHORTCUT`
opt-in stay — they remain the runtime gate that controls whether dev
contributors see the buttons in their dev session.

## R3. Cross-form `sending` and error state stays unified

While a magic-link send is in flight, the dev-shortcut buttons must be
disabled — and vice versa: while a dev-shortcut sign-in is in flight,
the magic-link submit button and the other two dev-shortcut buttons
must be disabled. A single in-flight operation locks the whole form.
Inline errors and the server-error snackbar render in the same places
as today (one inline-error element, one snackbar instance) regardless
of which path raised the error.

## R4. Behaviour-equivalence preserved by Vitest tests

The Vitest tests that today live in
`web/src/lib/auth/components/LoginRequest.test.ts` and cover the dev
shortcut — buttons appear when enabled, click triggers
`devPasswordSignIn` then `setSignedIn`, in-flight click is gated, 4xx
inline / 5xx snackbar / non-HttpError snackbar, cross-form `sending` —
continue to assert the same behaviour, even though the implementation
now lives in a child component. The split between
`LoginRequest.test.ts` (parent) and a new `DevShortcuts.test.ts`
(child) is an internal reorganisation; nothing covered by the existing
suite stops being covered.

## R5. No regression in the magic-link / Playwright path

The non-dev-shortcut behaviour of `LoginRequest.svelte` is unchanged.
The existing Playwright spec at `web/e2e/auth.spec.ts` (magic-link
hash-fragment flow) continues to pass without modification.

## Non-requirements (explicitly excluded)

- **Removing `devPasswordSignIn` from `auth-client.ts`.** The helper
  stays exported. After the refactor only the dev-only child imports
  it, so Vite tree-shaking drops it from the prod graph; explicitly
  splitting it into its own module is unnecessary churn.
- **Server-side hardening of `/token?grant_type=password`.** Whether
  the endpoint accepts real prod accounts is a GoTrue-config question,
  separately tracked in `docs/deployment.md` → "Auth surface:
  pre-deploy checklist" item 1. Out of scope here.
- **An automated CI grep against the prod bundle.** Worth doing
  eventually as a release-gate check, but the deployment doc already
  treats the grep as a manual pre-deploy step, and we don't have a
  prod-build CI job yet. Re-raise when step 13 wires up the deploy.
- **Removing `isDevLoginShortcutEnabled()` or the
  `VITE_DEV_LOGIN_SHORTCUT` env var.** Both stay as the runtime
  opt-in inside dev mode (some contributors prefer not to see the
  buttons even locally).
- **Touching `web/e2e/auth.spec.ts`.** The Playwright spec doesn't
  exercise the dev shortcut; no change needed.
