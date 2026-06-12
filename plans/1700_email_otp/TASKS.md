# Tasks

## Reference skills and docs

- **`docs/gotrue-templates.md`** — how GoTrue fetches the magic-link template
  over HTTP in dev (via the `static` sidecar) and prod (via the `web` container).
- **`docs/email-html.md`** — table-only, email-safe HTML conventions the
  template must follow.
- **`docs/architecture.md`** — auth flow and the cookie-plant / JWT-storage shim.
- **`docs/testing.md`** — three test layers (pgTAP / Vitest / Playwright).
- **`plans/0303_strip_otp/`** — the plan this reverses; reuse its email-safe HTML,
  invert its OTP-absence Playwright guard.

## Phase 0 — reconcile docs

### [ ] 0.1 Reconcile docs with the OTP reversal

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** `docs/gotrue-templates.md` and `docs/architecture.md` currently mandate
*stripping* the OTP and state Cairn "has no code-entry screen." This plan adds
that screen and keeps the code. Reconciling the spec first stops later phases
from referencing a stale, strip-mandating doc.

**Prerequisites:** None.

**Decisions:**
- Cairn now *keeps* `{{ .Token }}` because there is a code-entry screen on
  `/auth/check`. The social-engineering trade-off is acknowledged and mitigated
  by the e-mail line "Don't share this code with anyone."
- The typed code authenticates via `POST /auth/verify` with
  `{ type:'magiclink', email, token }`, which is already a cookie-plant path —
  no new edge surface.

**Files:**
- `docs/gotrue-templates.md` (modify)
- `docs/architecture.md` (modify)
- `docs/development.md` (modify)

**Steps:**
1. In `docs/gotrue-templates.md`: rewrite the opening rationale (Cairn keeps the
   OTP, has a code-entry screen); update the "Template syntax" table note that
   says not to reference `{{ .Token }}`; correct the CI-assertion note (CI now
   asserts the code is *present*, not absent). Also re-word the two spots that
   use "a six-digit code appears" as the diagnostic for a template-fetch
   fallback — the production/ACME-race paragraph ("the email ships with the
   six-digit OTP code") and the Troubleshooting entry "**The email still shows a
   six-digit code.**" Now that the code is wanted in *both* the custom and the
   default template, "a code appears" is no longer the tell; the symptom of a
   fallback is the *wrong* template rendering (default, unbranded, missing the
   "Don't share this code" line and Cairn layout).
2. In `docs/architecture.md`: in the auth section (~line 122) and the numbered
   flow (~line 240), add the code-entry alternative — `POST /auth/verify
   {type:'magiclink', email, token}` returns the session, cookie planted on
   `/auth/verify`, tokens stripped — as a sibling to clicking the link.
3. In `docs/development.md`: where the magic-link flow is walked, note the e-mail
   now also carries a code and the `/auth/check` screen accepts it.

**Verify:** `git diff --stat docs/` · manual read for internal consistency

## Phase 1 — e-mail template and OTP length

### [ ] 1.1 Surface the code in the e-mail; invert the Playwright OTP guard

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** The e-mail must carry a typeable six-digit code (R1). Plan 0303 added a
Playwright guard asserting no six-digit code appears; that contract is now
reversed. Template change and guard inversion land together so the e2e stays
green in one commit.

**Prerequisites:** Phase 0 (docs reconciled).

**Decisions:**
- Add a `{{ .Token }}` block presented as a code to type, plus the line
  **"Don't share this code with anyone."** Keep the table-only, email-safe
  layout from `docs/email-html.md` (no CSS layout, `bgcolor` not CSS
  `background`, `<b>` not `font-weight`, padding not margin).
- The Mailpit helper already returns `{ link, html, text }`; add the extracted
  six-digit code (regex `\b\d{6}\b` on the text part) to the return shape so the
  spec and the later code-entry test can reuse it.
- `GOTRUE_MAILER_OTP_LENGTH: "6"` is pinned in the **base** `docker-compose.yml`
  gotrue env so both overlays inherit it and match the frontend's 6-digit field.

**Reference:** `docs/email-html.md` for the safe-HTML rules; `docs/gotrue-templates.md`
for how the template is served in each environment.

**Files:**
- `web/static/gotrue/templates/magic_link.html` (modify)
- `docker-compose.yml` (modify)
- `web/e2e/helpers/mailpit.ts` (modify)
- `web/e2e/auth.spec.ts` (modify)

**Steps:**
1. RED — In `web/e2e/auth.spec.ts`, invert the existing OTP assertions
   (`auth.spec.ts:25-26`): assert the code **is** present in both `html` and
   `text`. Run the auth spec against the current (stripping) template and confirm
   it fails red.
2. GREEN — Add the `{{ .Token }}` code block and the "Don't share this code with
   anyone." line to `web/static/gotrue/templates/magic_link.html`, keeping the
   table-only layout. Pin `GOTRUE_MAILER_OTP_LENGTH: "6"` in `docker-compose.yml`.
   Recreate gotrue (`docker compose up -d --force-recreate gotrue static`).
3. GREEN — Extend `web/e2e/helpers/mailpit.ts` to also return the extracted
   `code` (six-digit match on the text part). Re-run the auth spec; the inverted
   assertion passes and the magic-link-click happy path still passes.

**Verify:** `cd web && pnpm test:e2e -- auth` · `docker compose logs gotrue` (no
template-fetch fallback)

## Phase 2 — auth client and input primitive

### [ ] 2.1 Add `verifyOtp` to the auth client

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** The code-entry screen needs a function that exchanges the typed code for
a session (R2, R3). It mirrors `exchangeRefreshToken` but targets `/auth/verify`.

**Prerequisites:** None (uses existing `postJson`, `assertAuthUser`, `HttpError`
in `auth-client.ts`).

**Decisions:**
- Signature: `verifyOtp(email: string, token: string): Promise<{ user: AuthUser }>`.
- Body: `POST /verify` with `{ type: 'magiclink', email, token }`. On 200 the
  shim has already planted the cookie and stripped tokens; the JSON carries
  `user`, validated by the existing `assertAuthUser`.
- Errors are **not** swallowed (unlike `sendMagicLink`): a non-2xx throws
  `HttpError` so the caller can show an inline "incorrect or expired" message.
  This leaks nothing — GoTrue returns the same 4xx for wrong code and unknown
  e-mail, and the user already holds a pending e-mail.

**Files:**
- `web/src/lib/auth/model/auth-client.ts` (modify)
- `web/src/lib/auth/model/auth-client.test.ts` (modify — the file already exists)

**Steps:**
1. RED — Add Vitest cases: `verifyOtp` POSTs to `/verify` with the
   `{type:'magiclink', email, token}` body; returns `{ user }` on a 200 with a
   valid user; throws `HttpError` on a 4xx; throws (via `assertAuthUser`) when
   `user` is malformed. Run and confirm red.
2. GREEN — Implement `verifyOtp` per Decisions. Re-run; confirm green.

**Verify:** `cd web && pnpm test -- auth-client` · `pnpm lint` · `pnpm check`

### [ ] 2.2 Add `maxlength` passthrough to `TextInput`

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** The code field caps input at 6 characters; `TextInput` currently has no
`maxlength` prop (R4). Extending the shared primitive avoids a bespoke component.

**Prerequisites:** None.

**Decisions:**
- Add an optional `maxlength?: number` prop, forwarded to the `<input>`'s
  `maxlength` attribute alongside the existing passthrough props (`inputmode`,
  `autocomplete`, etc.). No behaviour change when omitted.

**Files:**
- `web/src/lib/basic/components/TextInput.svelte` (modify)
- `web/src/lib/basic/components/TextInput.test.ts` (modify)

**Steps:**
1. RED — Add a Vitest case asserting `maxlength={6}` renders
   `maxlength="6"` on the input. Run; confirm red.
2. GREEN — Add the prop and bind it on the `<input>`. Re-run; confirm green.

**Verify:** `cd web && pnpm test -- TextInput` · `pnpm check`

## Phase 3 — code-entry UI and end-to-end

### [ ] 3.1 Code-entry field with auto-submit on the "Check your inbox" screen

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** Lets the user finish sign-in on the device they started on by typing the
code from the e-mail (R4). This is the core of the feature.

**Prerequisites:** Task 2.1 (`verifyOtp`), Task 2.2 (`TextInput` `maxlength`).

**Decisions:**
- `LoginCheck.svelte` already receives `email` (from the `pendingLogin` store via
  `/auth/check/+page.svelte`). Add below the resend row:
  - a `TextInput` with `inputmode="numeric"`, `autocomplete="one-time-code"`,
    `maxlength={6}`, a `data-test` (e.g. `login-check-code`), and client-side
    validation to a 6-digit numeric string;
  - a `Button` "Sign in" (`data-test="login-check-verify"`), disabled unless the
    code is valid and not in flight.
- **Auto-submit (edge-triggered):** when the field *reaches* a valid 6-digit
  code, fire verify automatically; the button stays as fallback. Guard with
  `let verifying = $state(false)` so autofill + button can't double-fire **while a
  call is in flight**. Critically, the trigger must be **edge-triggered** — fired
  from the input event, or gated on the last-submitted code — **not** a
  level-triggered `$effect` keyed on "value is a valid 6-digit code". A
  level-triggered effect re-runs the moment `verifying` flips back to `false`
  after a 4xx (the value is still six digits), looping POSTs against
  `/auth/verify` and burning GoTrue OTP attempts / tripping rate-limits. Only a
  fresh edit may re-arm auto-submit.
- Success: `await verifyOtp(email, code)` → `setSignedIn(user)` (from
  `$lib/shared/state/session.svelte`) → `goto(resolve('/'))` (lands on `/lists`),
  matching `/auth/callback`'s post-success navigation. **Avoid the redirect
  race:** `LoginCheck` lives inside the `pendingLogin`-gated
  `/auth/check/+page.svelte`, and `setSignedIn` fires `pending-login.svelte`'s
  auto-clear effect, which nulls `pendingLogin.email` and triggers the check
  page's `$effect` to `goto('/auth/login')` — competing with this `goto('/')`.
  Guard the check page's redirect effect with
  `&& session.current.status !== 'signed-in'` (in
  `web/src/routes/auth/check/+page.svelte`, added to this task's Files) so it
  doesn't bounce a just-signed-in user to the login screen.
- 4xx (`HttpError` with 4xx status): inline error "That code is incorrect or
  expired.", clear on next edit, no navigation. 5xx/network: snackbar. The screen
  has **no** snackbar today (only `LoginRequest.svelte` does), so add one
  mirroring that pattern — import `Snackbar`, an `errorSnack = $state(false)`
  flag, a `SNACKBAR_MESSAGE` constant, and a `<Snackbar>` at the end of the
  markup with a `data-test`. Copy is British English.
- Update the screen copy to mention both link and code ("Tap the link on this
  device, or enter the code below.").

**Reference:** `web/src/routes/auth/callback/+page.svelte` for the
`setSignedIn` → `goto` success pattern; `docs/ui.md` for screen conventions.

**Files:**
- `web/src/lib/auth/components/LoginCheck.svelte` (modify)
- `web/src/lib/auth/components/LoginCheck.test.ts` (modify)
- `web/src/routes/auth/check/+page.svelte` (modify — guard the redirect effect
  with `&& session.current.status !== 'signed-in'`; see Decisions)

**Steps:**
1. RED — Add Vitest cases: verify button disabled until a valid 6-digit code;
   auto-submit fires `verifyOtp` exactly once when six valid digits are entered;
   in-flight gating blocks a second submit; success calls `setSignedIn` then
   navigates; a 4xx shows the inline error and does not navigate; a 5xx shows the
   snackbar. Mock `verifyOtp`, `setSignedIn`, and navigation. Run; confirm red.
2. GREEN — Implement the field, auto-submit, and handlers per Decisions. Re-run;
   confirm green.

**Verify:** `cd web && pnpm test -- LoginCheck` · `pnpm lint` · `pnpm check`

### [ ] 3.2 Update the request-screen button copy

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** The e-mail now carries a link and a code, so "Send me a magic link" is
no longer accurate (R5).

**Prerequisites:** None.

**Decisions:**
- Change the submit button label in `LoginRequest.svelte` to **"Send me a sign-in
  e-mail"** (British English; `data-test="login-submit"` unchanged). Update the
  test's label expectation.

**Files:**
- `web/src/lib/auth/components/LoginRequest.svelte` (modify)
- `web/src/lib/auth/components/LoginRequest.test.ts` (modify)

**Steps:**
1. RED — `LoginRequest.test.ts` currently asserts only on
   `data-test="login-submit"`, never on the button text, so there is no
   old-label assertion to flip. *Add* a new assertion that the submit button
   reads "Send me a sign-in e-mail"; run against the current copy ("Send me a
   magic link") and confirm the new assertion fails red.
2. GREEN — Change the button text. Re-run; confirm green.

**Verify:** `cd web && pnpm test -- LoginRequest` · `pnpm check`

### [ ] 3.3 Playwright code-entry happy path

**Created:** 2026-06-12T13:25:47Z
**Completed:**

**Why:** Proves the typed-code path works end to end through the real stack —
including that `/auth/verify` plants the HttpOnly `cairn_session` cookie in the
prod-shaped shim (R7).

**Prerequisites:** Task 1.1 (e-mail carries the code, helper returns it),
Task 3.1 (code field exists).

**Decisions:**
- New test alongside the existing magic-link-click test (which stays). Request an
  e-mail, read the code via the extended Mailpit helper, type it on `/auth/check`,
  assert landing on `/lists` and that `cairn_session` is set with `httpOnly` and
  `sameSite: 'Lax'` — same assertions the link-click test makes.
- **Reach `/auth/check` via the request flow, never a direct visit.**
  `pendingLogin` is a module-scoped singleton wiped on hard reload, and
  `/auth/check/+page.svelte` redirects to `/auth/login` when it's empty. The test
  must drive the request screen (fill `login-email` → click `login-submit` → land
  on `/auth/check`) and stay in the SPA; a `page.goto('/auth/check')` would bounce
  to login.
- Do **not** navigate to the link in this test; entering the code is the whole
  point (the device that reads the e-mail differs from the one that types).

**Files:**
- `web/e2e/auth.spec.ts` (modify)

**Steps:**
1. Add the code-entry test using the helper's `code`. Because its prerequisite
   (Task 3.1) lands the code field first, this is a post-implementation
   end-to-end guard with no meaningful RED — the same way the existing
   magic-link happy-path spec was introduced. Don't contrive a temporary red;
   just assert the real flow.
2. GREEN — With 3.1 in place, the flow lands on `/lists` with the cookie set.
   Confirm green; confirm the existing link-click test still passes.

**Verify:** `cd web && pnpm test:e2e -- auth` · `./scripts/check.sh --e2e`
