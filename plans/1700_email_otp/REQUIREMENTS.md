# Requirements: One-time code (OTP) alongside the magic link

The sign-in / sign-up e-mail currently carries **only** a magic link, so a user
must finish on whichever device opens the e-mail — usually their phone, even
when they started on desktop. Now that Cairn is a live alpha, real users have
been blocked by this. This plan sends a short one-time code **in the same
e-mail** and adds a code-entry box to the "Check your inbox" screen, so a user
can finish on the device they started on. It deliberately **reverses**
`plans/0303_strip_otp` (which stripped the code precisely because there was no
code-entry screen); the docs and CI guard from 0303 are reconciled, not bypassed.

## R1. Sign-in e-mail carries both a link and a six-digit code

The custom magic-link template
(`web/static/gotrue/templates/magic_link.html`) renders, in addition to the
existing `{{ .ConfirmationURL }}` sign-in button:

- the six-digit code via `{{ .Token }}`, clearly presented as a code to type, and
- the line **"Don't share this code with anyone."** as anti-phishing copy.

The template keeps the table-only, email-safe HTML conventions of
`docs/email-html.md`. Because GoTrue derives the plain-text MIME part by
stripping HTML, the code appears in both parts automatically. The single file is
served to GoTrue in both environments (dev via the `static` nginx sidecar, prod
via the internal `web` container), so dev and prod stay in sync structurally.

## R2. The typed code authenticates via `POST /auth/verify`

Submitting the code performs:

```
POST /auth/verify   { "type": "magiclink", "email": <email>, "token": <code> }
```

On success GoTrue returns the session JSON. `/auth/verify` is already a
cookie-plant path (`COOKIE_PLANT_PATHS` in
`web/src/lib/shared/model/auth-paths.ts`), so in **both** environments the shim
(dev Vite proxy / prod `auth-proxy`) plants the HttpOnly `cairn_session` cookie
from `access_token`, strips both tokens from the body, and returns `{ user, … }`
to page JS. No change to the path lists, either shim, or the Caddyfile is
required. The same GoTrue OTP backs both the typed code and the link's `token`
param, so the typed code verifies against the same record as clicking the link.

## R3. `verifyOtp` auth-client function with honest error surfacing

`web/src/lib/auth/model/auth-client.ts` exports
`verifyOtp(email, token): Promise<{ user: AuthUser }>`, mirroring
`exchangeRefreshToken`: it POSTs to `/verify`, asserts the user shape via the
existing `assertAuthUser`, and returns `{ user }`. Unlike the *send* step
(`sendMagicLink`, whose errors are swallowed to prevent e-mail enumeration), a
non-2xx from verify is a real `HttpError` the caller surfaces — at verify time
the user has already proved possession of a pending e-mail, and GoTrue returns
the same 4xx for a wrong code and an unknown e-mail, so nothing is leaked.

## R4. Code-entry UI on the "Check your inbox" screen, with auto-submit

`web/src/lib/auth/components/LoginCheck.svelte` gains a code field below the
existing resend row, using the e-mail already held in the `pendingLogin` store:

- A numeric input (`inputmode="numeric"`, `autocomplete="one-time-code"`,
  `maxlength` 6) plus a "Sign in" button. Submit is enabled only for a valid
  6-digit code.
- **Auto-submit:** when the field reaches a valid 6-digit code (including via
  browser/OS one-time-code autofill), verification fires automatically; the
  button remains an explicit fallback. An in-flight guard prevents double-submit.
- On success: `setSignedIn(user)` then navigate home (lands on `/lists`),
  matching the magic-link callback path.
- On a 4xx (wrong/expired code): inline error "That code is incorrect or
  expired.", no navigation. On 5xx/network: snackbar, matching the screen's
  existing error conventions.

## R5. Request-screen button reflects link + code

`web/src/lib/auth/components/LoginRequest.svelte`'s submit button reads
**"Send me a sign-in e-mail"** (was "Send me a magic link"), since the e-mail now
carries both. British English.

## R6. OTP length pinned for dev/prod parity

The base `docker-compose.yml` gotrue service pins `GOTRUE_MAILER_OTP_LENGTH: "6"`
so both overlays inherit it and the frontend's 6-digit validation cannot silently
drift from GoTrue's code length. OTP expiry stays at GoTrue's default (identical
across environments).

## R7. Tests reflect the reversal; both auth routes still work

- The Playwright OTP-**absence** assertions added by 0303
  (`web/e2e/auth.spec.ts`, `\b\d{6}\b` must be false) are **inverted** to assert
  the code is **present**; the Mailpit helper (`web/e2e/helpers/mailpit.ts`)
  returns the extracted code.
- A new Playwright path exercises code entry: request e-mail → on `/auth/check`
  type the code → land on `/lists` with the HttpOnly `cairn_session` cookie set.
- The existing magic-link-**click** path remains and still passes — both routes
  to a session work.
- Vitest covers `verifyOtp`, the `TextInput` `maxlength` passthrough, and the
  `LoginCheck` code field (auto-submit fires once, in-flight gating, success →
  `verifyOtp` → `setSignedIn` → navigate, 4xx → inline error, 5xx → snackbar),
  and the updated `LoginRequest` button label.

## R8. Docs reconciled with the reversal

`docs/gotrue-templates.md`, `docs/architecture.md` (auth section/flow), and
`docs/development.md` (where it walks the magic-link flow) are updated: Cairn now
*keeps* the OTP because there is a code-entry screen; the social-engineering
trade-off is acknowledged alongside the "Don't share this code" mitigation; the
guidance that the template must not reference `{{ .Token }}` and the CI-assertion
note are corrected.

## Non-requirements (explicitly excluded)

- **Any change to `auth-paths.ts`, the Vite proxy, the `auth-proxy` sidecar, or
  the Caddyfile** — `/auth/verify` is already a cookie-plant path in both
  environments; the verify flow rides existing infrastructure.
- **SMS / phone OTP** — e-mail only; phone auth is not configured.
- **A separate plain-text e-mail template** — GoTrue derives the text part from
  the HTML, so the code reaches both parts from one file (same rationale as 0303).
- **Changes to GoTrue's send rate-limiting or anti-enumeration at the send step**
  — `sendMagicLink` still swallows errors; only the verify step surfaces them.
- **Removing the magic link** — the link stays; the code is *additional* ("send
  a code alongside the link").
