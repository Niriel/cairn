# Requirements: Strip OTP code from magic-link email

GoTrue's default magic-link email includes both a clickable confirmation URL
and a six-digit OTP token (`{{ .Token }}`). Cairn has no code-entry screen, so
the token is unused UI that creates a social-engineering surface — a user can
be tricked into reading it aloud. This plan replaces the default template with
a link-only version and adds a Playwright assertion to prove prod emails will
never carry a six-digit code.

## R1. Custom GoTrue magic-link HTML template

A custom HTML email template is stored at `gotrue/templates/magic_link.html`
in the repository. The template renders:

- the Cairn brand name,
- a single clickable sign-in link bound to `{{ .ConfirmationURL }}`,
- a one-line "if you didn't request this, ignore it" note in British English.

The template must NOT reference `{{ .Token }}` anywhere, and must not contain
any six-digit numeric sequence that could be read as an OTP.

## R2. Template wired into the dev Docker stack

The GoTrue service in `docker-compose.yml` mounts
`./gotrue/templates` into the container as a read-only bind mount and sets
`GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` to the in-container path of the HTML
file. The existing stack configuration is otherwise unchanged.

## R3. Plain-text email part also code-free

GoTrue v2 generates the plain-text MIME part by stripping HTML from the HTML
template. Because the HTML template contains no `{{ .Token }}` reference, the
plain-text part will also be code-free. No separate text template file is
required; the constraint is satisfied structurally by R1.

## R4. Playwright assertion on link presence and OTP absence

The existing "magic-link happy path" Playwright test is extended to fetch the
full email body from Mailpit (both HTML and plain-text) and assert:

- the confirmation URL is present in the HTML body,
- neither the HTML body nor the plain-text body matches `\b\d{6}\b`
  (a word-boundary-delimited six-digit numeric sequence).

## R5. Mailpit helper returns full email body

The `waitForMagicLink` helper in `web/e2e/helpers/mailpit.ts` is updated to
return `{ link: string; html: string; text: string }` so the assertion in R4
can be written without a second network round-trip to Mailpit. Existing callers
are updated to destructure `link` from the result.

## Non-requirements (explicitly excluded)

- **Separate plain-text template file** — GoTrue strips HTML for the text
  part automatically; a separate file adds maintenance surface with no
  benefit.
- **Production compose changes** — the prod compose (`docker-compose.prod.yml`)
  is step 14's responsibility; this plan only touches `docker-compose.yml`.
- **Branded design polish** — the template is intentionally minimal; full brand
  styling (colour palette, logo image) is not a goal before the first prod
  deploy.
- **Code-entry screen** — Cairn is link-only; adding a fallback OTP entry
  screen is explicitly out of scope.
