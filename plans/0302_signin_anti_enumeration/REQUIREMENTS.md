# Requirements: honour the magic-link anti-enumeration contract in the sign-in UI

`docs/admin.md` → "What the web app shows when a banned user tries
to sign in" defines a structural anti-enumeration contract: every
outcome `POST /auth/magiclink` can produce (link sent, banned,
unconfirmed, rate-limited, unknown email) must render the identical
post-submit screen. The current `LoginRequest.svelte` violates that
contract by rendering an inline error on 4xx and flipping a snackbar
on 5xx / network failure, and `LoginCheck.svelte`'s *Send again*
button quietly hides its "Sent again." confirmation on failure —
both expose the underlying outcome to anyone probing emails. This
plan brings both surfaces under the contract and lands the
design-handoff copy fixes the screens have been drifting from. Must
land before step 14's deploy so the contract is honoured on day 1
of production.

## R1. The magic-link submit path renders the same post-submit screen for every GoTrue outcome

After the user clicks *Send me a magic link* on `LoginRequest.svelte`
with a syntactically valid email:

- The browser navigates to `/auth/check` regardless of GoTrue's HTTP
  response (`2xx`, `4xx`, `5xx`, or a network-layer rejection).
- `setPendingLogin(email)` is called on every path, so `/auth/check`
  renders with the address the user typed.
- No inline error text is shown in any case. `queryByDataTest('login-error')`
  returns `null` after the submit settles.
- No error snackbar opens in any case. The snackbar markup may exist
  in the DOM (it's the same primitive the dev-shortcut path uses, see
  R5) but its `open` prop stays `false` for the magic-link path.
- The user-visible call timing is the same response-bound await
  as today's success path — no fire-and-forget that would skew the
  perceived latency between outcomes.

The HTTP layer (`web/src/lib/auth/model/auth-client.ts`) does **not**
change. `sendMagicLink` still throws `HttpError` on non-2xx; the UI
layer chooses to discard those throws.

## R2. The "Send again" button on `/auth/check` honours the same contract

After the user clicks *Send again* on `LoginCheck.svelte`:

- The button disables, awaits a single `sendMagicLink(email)` call,
  re-enables.
- The "Sent again." confirmation (`data-test="login-check-resend-confirmation"`)
  appears for 3 seconds regardless of GoTrue's HTTP response.
- No error UI surfaces in any case (it has none today either; this
  requirement preserves that).

The contract from `docs/admin.md:185` is endpoint-level — "the same
button on every screen, with the same effect, is fine." A resend
that shows different visual feedback on success vs. failure breaks
that.

## R3. The design-handoff copy lands

`LoginRequest.svelte`'s `.hint` paragraph reads exactly:

> No password. We'll e-mail you a link to continue.
> Your data lives on a small server in Germany.

`LoginCheck.svelte`'s `.body` paragraph reads exactly:

> We sent a link to **{email}**. Tap it on this device to continue.

Both strings are mirrored from the design canvas
(`design/cairn-screens.jsx:167` and `:207-208`) and from the canonical
copy quoted in `docs/admin.md:165`. *"Continue"* over *"sign in"* is
load-bearing — it reads naturally for both first-time signups (whose
email becomes a new account on click of the link) and returning
users; *"sign in"* slightly excludes the first audience
(`docs/admin.md:175`).

## R4. Behaviour is locked in by Vitest and Playwright

- `web/src/lib/auth/components/LoginRequest.test.ts` cases (d), (e),
  (f) are rewritten to assert the new contract: 4xx, 5xx, and
  network-failure submits each navigate to `/auth/check`, call
  `setPendingLogin(email)`, leave `queryByDataTest('login-error')`
  null, and do not open the snackbar.
- `web/src/lib/auth/components/LoginCheck.test.ts` gains one case
  asserting that an `HttpError(400)` rejection from `sendMagicLink`
  still flips `data-test="login-check-resend-confirmation"` visible.
- `web/e2e/auth.spec.ts` gains a second `test(...)` block that
  uses `page.route('**/auth/magiclink*', ...)` to fulfil with
  status 429, clicks *Send me a magic link*, and asserts the same
  `/auth/check` destination + same `login-check-heading` + same
  `login-check-email` value as the happy path. The original
  happy-path test stays untouched.

## R5. The dev-login shortcut surface is unchanged

`DevShortcuts.svelte` (created in 0301) remains the dev-only sign-in
surface. Its 4xx → `onInlineError(message)` and 5xx → `onServerError()`
callbacks keep firing into `LoginRequest.svelte`'s `inlineError` and
`errorSnack` state. The parent's `<Snackbar>` and `{#if inlineError}`
blocks stay in place to receive those dev-only signals; the entire
DevShortcuts module is excluded from the prod bundle by 0301's
dynamic-import gate, so the error surfaces are unreachable from a
production user. No `DevShortcuts.svelte` or `DevShortcuts.test.ts`
edits in this plan; tests `(b)`, `(j)`, and `(h)` in
`LoginRequest.test.ts` stay verbatim.

## Non-requirements (explicitly excluded)

- **Removing `Snackbar` / `inlineError` / `errorSnack` from
  `LoginRequest.svelte` entirely.** They still serve the dev-shortcut
  path. Moving them into `DevShortcuts.svelte` would split state
  ownership for zero observable gain — prod doesn't ship the
  code that uses them.
- **Changes to `auth-client.ts` or `HttpError`.** The HTTP layer's
  throw-on-non-2xx behaviour is correct; only the UI policy on the
  caught error changes.
- **Server-side / GoTrue config hardening.**
  `GOTRUE_DISABLE_SIGNUP=true` and `GOTRUE_MAILER_AUTOCONFIRM=false`
  are step-14 deploy concerns
  (`plans/0000_implementation_order.md:236-245`). This plan is the
  client-side complement.
- **Timing-side-channel mitigations beyond awaiting the response.**
  The contract (`docs/admin.md:175`) is about the *screen being
  identical*, not about resistance to network-timing fingerprints.
  A determined attacker observing wire timing across many requests
  could still distinguish a SMTP-bound 2xx from a fast-fail 4xx;
  closing that channel is out of scope for v1.
- **An *"Account issues? Contact <address>"* surface.**
  `docs/admin.md:189` flags this as the only escape from
  indistinguishability when banned users need an in-product appeal
  route. Deliberately deferred — landing it needs a decided
  contact address and is its own concern.
- **Rewriting any `LoginCheck.test.ts` case other than the new
  "confirmation appears on failure too" addition.** The existing
  cases cover headings, email rendering, resend wiring, and
  confirmation display on success; only the failure-still-confirms
  case is added.
- **Touching `docs/admin.md`.** The doc already describes the
  post-fix behaviour as the contract. The only doc that needs
  reconciliation is `docs/development.md:230`, which describes the
  current `LoginRequest` behaviour as state-of-the-world; that fix
  is part of this plan's Phase 0.
