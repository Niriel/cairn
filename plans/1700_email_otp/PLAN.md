# Plan: One-time code (OTP) alongside the magic link

Send a six-digit code in the sign-in e-mail next to the magic link and add a
code-entry box to the "Check your inbox" screen, so a user can finish on the
device they started on. This reverses `plans/0303_strip_otp` now that the
premise behind that plan — "Cairn has no code-entry screen anyway" — no longer
holds: live-alpha users have been blocked by the link-only flow.

## Context

Today the flow is link-only. `LoginRequest.svelte` POSTs to `/auth/magiclink`
(via `sendMagicLink` in `web/src/lib/auth/model/auth-client.ts`), the user lands
on `/auth/check` (`LoginCheck.svelte`), opens the e-mail, clicks the link, and
`/auth/callback` exchanges the refresh token from the URL hash for a session.
Plan 0303 deliberately stripped the six-digit OTP (`{{ .Token }}`) from the
e-mail template and added a Playwright guard (`\b\d{6}\b` must be absent) because
the code was unusable UI and a social-engineering surface.

The friction 0303 didn't anticipate: the e-mail is usually read on a _different_
device than the one the user started on. A code the user can type closes that
gap. GoTrue already mints the OTP — it is the same value as the link's `token`
param — so this is wiring, not new auth machinery.

The decisive find during exploration: **`/auth/verify` is already in
`COOKIE_PLANT_PATHS`** (`web/src/lib/shared/model/auth-paths.ts:14`), honoured by
both the dev Vite proxy (`web/vite.config.ts:139-165`) and the prod `auth-proxy`
(`auth-proxy/src/index.ts:130-159`). A `POST /auth/verify` with the typed code
returns the session JSON; the shim plants the `cairn_session` cookie and strips
the tokens, handing page JS just `{ user }`. So the entire backend/edge surface
of this feature already exists — no path-list, proxy, or Caddyfile edits.

"Keep configs in sync" (the user's explicit ask) is largely structural here: the
e-mail template is a single shared file served to GoTrue in both environments,
and the verify behaviour is identical in both shims. The one env we pin is OTP
length, so GoTrue's code length and the frontend's 6-digit validation can't drift.

## Decisions

**Reverse 0303 rather than add a parallel flow.** 0303's template strip and its
CI guard actively forbid `{{ .Token }}`. Adding a code path while leaving those
in place would be self-contradictory (and the CI guard would fail). The honest
move is to reconcile 0303's docs and invert its assertion, keeping its
email-safe-HTML and single-file-template decisions intact (R1, R8).

**Verify over `/auth/verify`, not a new endpoint.** GoTrue's `POST /verify` with
`{ type: 'magiclink', email, token }` recomputes the same token hash the link
uses, so the typed code and the clicked link verify against one record. Because
`/auth/verify` is already a cookie-plant path, the typed-code response gets the
exact cookie/JWT treatment a link click already gets — identical security
posture, zero new edge surface (R2). The callback page's refresh-token exchange
stays as-is for the link path; the code path is a sibling, not a replacement.

**Errors are swallowed at send, surfaced at verify.** `sendMagicLink` swallows
all errors to prevent e-mail enumeration (`docs/admin.md`). Verify is different:
the user already holds a pending e-mail, and GoTrue returns the same 4xx for a
wrong code and an unknown e-mail, so an inline "incorrect or expired" message
leaks nothing. This split is deliberate and must be preserved (R3).

**Auto-submit with a button fallback.** Once six valid digits are present
(typed or autofilled via `autocomplete="one-time-code"`), verification fires
automatically, guarded against double-submit by the in-flight flag; the "Sign
in" button stays for the keyboard/paste case (R4). Chosen over button-only
because OS one-time-code autofill is the common case on the phone-reads-email,
desktop-types-code scenario this feature targets.

**Pin OTP length, not expiry.** The frontend hardcodes a 6-digit field, so
`GOTRUE_MAILER_OTP_LENGTH: "6"` in the base compose guards the coupling. Expiry
is left at GoTrue's default — identical in both environments and not coupled to
any client constant (R6).

**Extend `TextInput`, don't add an `OtpInput`.** The code field is an ordinary
text input with `inputmode="numeric"`, `autocomplete="one-time-code"`, and a
length cap. Adding a `maxlength` passthrough to the existing
`web/src/lib/basic/components/TextInput.svelte` is smaller and reusable; a
bespoke component would duplicate it.

## Architecture

### Modified files

- **`web/static/gotrue/templates/magic_link.html`** — add a `{{ .Token }}` code
  block and the "Don't share this code with anyone." line, table-only layout.
- **`docker-compose.yml`** — pin `GOTRUE_MAILER_OTP_LENGTH: "6"` on the gotrue
  service (base file, inherited by both overlays).
- **`web/src/lib/auth/model/auth-client.ts`** — add `verifyOtp(email, token)`.
- **`web/src/lib/basic/components/TextInput.svelte`** — add `maxlength` prop.
- **`web/src/lib/auth/components/LoginCheck.svelte`** — code field + auto-submit
  - verify wiring + error handling.
- **`web/src/lib/auth/components/LoginRequest.svelte`** — button copy.
- **`web/e2e/helpers/mailpit.ts`** — return the extracted six-digit code.
- **`web/e2e/auth.spec.ts`** — invert the OTP-absence assertion; add code-entry
  happy path.
- **Vitest tests** — `auth-client.test.ts` (new or extended), `TextInput.test.ts`,
  `LoginCheck.test.ts`, `LoginRequest.test.ts`.
- **Docs** — `docs/gotrue-templates.md`, `docs/architecture.md`,
  `docs/development.md`.

### Verify-code data flow (both environments)

```
LoginCheck → POST /auth/verify {type:magiclink,email,token}
   → shim (Vite dev / auth-proxy prod):
        forwards to GoTrue /verify
        on 200: plant cairn_session cookie from access_token, strip tokens
   → page JS receives { user }
   → setSignedIn(user) → goto('/') → /lists
```

## Phase structure

TDD throughout: RED (failing test / inverted assertion) before GREEN.

0. **Phase 0 — reconcile docs (R8).** Update `docs/gotrue-templates.md`,
   `docs/architecture.md`, and `docs/development.md` so the spec reflects that
   Cairn now keeps the OTP and has a code-entry screen. Lands first so later
   phases don't reference a stale, strip-mandating spec.

1. **Phase 1 — e-mail template + OTP length (R1, R6, R7-partial).** Invert the
   Playwright OTP guard (RED: assert the code is _present_ against the
   still-stripping template → fails) and extend the Mailpit helper to return the
   code; then add `{{ .Token }}` + the anti-phishing line to the template and pin
   `GOTRUE_MAILER_OTP_LENGTH` (GREEN). The magic-link-click happy path stays green.

2. **Phase 2 — auth-client + input primitive (R2, R3).** Add `verifyOtp` with
   Vitest coverage (RED → GREEN), and the `TextInput` `maxlength` passthrough with
   a Vitest assertion. These are the producers Phase 3 consumes — landing them
   first avoids the type-checker fighting a not-yet-existing symbol.

3. **Phase 3 — code-entry UI + e2e (R4, R5, R7).** Extend `LoginCheck.svelte`
   with the auto-submitting code field and verify wiring (Vitest component tests
   RED → GREEN), update the `LoginRequest` button copy (Vitest), and add the
   Playwright code-entry happy path that proves the prod-shaped `/auth/verify`
   cookie-plant end to end.

## Reference docs and skills

- **`docs/gotrue-templates.md`** — how GoTrue fetches the template over HTTP in
  each environment; the file this plan rewrites.
- **`docs/email-html.md`** — table-only, email-safe HTML the template must keep.
- **`docs/architecture.md`** — auth flow (`/auth/magiclink`, `/auth/verify`,
  cookie-plant, JWT storage); the `/otp` alias note at ~line 242.
- **`docs/admin.md`** — why the _send_ step is anti-enumeration (errors swallowed).
- **`docs/testing.md`** — three layers: Vitest for `verifyOtp`/components,
  Playwright for the end-to-end code-entry path.
- **`plans/0303_strip_otp/`** — the plan this reverses; reuse its email-safe-HTML
  and single-file decisions, invert its OTP-absence guard.

## Open questions

None — UX/copy forks (anti-phishing line, auto-submit, button copy) were settled
with the user before writing this plan.
