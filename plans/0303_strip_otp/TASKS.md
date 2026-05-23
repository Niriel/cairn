# Tasks

## Reference skills and docs

- **`docs/testing.md`** — three test layers; Playwright covers end-to-end email
  body assertions.
- **`docs/deployment.md`** — "Auth surface: pre-deploy checklist" for context on
  why this must land before step 14.

## Phase 1 — template file and stack wiring

### [x] 1.1 Create the custom magic-link HTML template

**Created:** 2026-05-23T06:06:12Z
**Completed:** 2026-05-23T06:47:35Z

**Why:** GoTrue's default template includes `{{ .Token }}` (a six-digit OTP).
Supplying a custom template that omits it removes the social-engineering surface
without changing any sign-in behaviour — Cairn's flow only uses the link, not
the code.

**Prerequisites:** None.

**Decisions:**
- Template uses only `{{ .ConfirmationURL }}`; `{{ .Token }}` must not appear
  anywhere in the file.
- Minimal inline CSS only (no external stylesheet, no image assets). GoTrue
  renders the template server-side and mails it; no JS, no external fetch.
- Brand name "Cairn" appears as a plain `<h2>`.
- Ignore note reads: *"If you didn't request this, you can safely ignore this
  e-mail."* — British English ("e-mail" hyphenated per project convention).
- GoTrue v2 uses Go's `text/template` syntax: `{{ .ConfirmationURL }}` is the
  exact variable name for the magic-link URL.

**Files:**
- `gotrue/templates/magic_link.html` (create)

**Steps:**
1. Create the directory `gotrue/templates/` (it does not exist yet).
2. Write `gotrue/templates/magic_link.html` with this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Cairn</title>
</head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 24px;color:#111;">
  <h2 style="margin-bottom:8px;">Cairn</h2>
  <p>Tap the link below to sign in.</p>
  <p style="margin:32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
      Sign in to Cairn
    </a>
  </p>
  <p style="font-size:14px;color:#666;">If you didn't request this, you can safely ignore this e-mail.</p>
</body>
</html>
```

3. Confirm the file contains no occurrence of `Token` (grep to be sure).

**Verify:** `grep -i token gotrue/templates/magic_link.html` — must return no output.

### [x] 1.2 Wire the template into docker-compose.yml

**Created:** 2026-05-23T06:06:12Z
**Completed:** 2026-05-23T06:50:26Z

**Why:** GoTrue only uses a custom template when told where to find it via
`GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` and when the file is reachable inside the
container via a volume mount.

**Prerequisites:** Task 1.1 (`gotrue/templates/magic_link.html` exists).

**Decisions:**
- Mount path inside the container: `/gotrue/templates` (read-only). Matches the
  env var value to keep the mental model simple.
- The `volumes` key is new on the `gotrue` service; no other service is changed.
- Only `docker-compose.yml` (the dev compose) is modified here. The prod compose
  (`docker-compose.prod.yml`) is step 14's responsibility.

**Files:**
- `docker-compose.yml` (modify)

**Steps:**
1. In the `gotrue` service `environment` block, add after the existing SMTP
   vars:
   ```yaml
   GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: /gotrue/templates/magic_link.html
   ```
2. Add a `volumes` block to the `gotrue` service (it has none currently):
   ```yaml
   volumes:
     - ./gotrue/templates:/gotrue/templates:ro
   ```
3. Restart the gotrue container to pick up the new config:
   ```
   docker compose up -d --force-recreate gotrue
   ```
4. Check GoTrue logs for startup errors: `docker compose logs --tail=20 gotrue`.
   A successful start will not mention template errors; a misconfigured path
   will log `error reading template`.

**Verify:** `docker compose logs --tail=20 gotrue` — no `error reading template` line. · `grep GOTRUE_MAILER_TEMPLATES_MAGIC_LINK docker-compose.yml` — returns the new env var.

## Phase 2 — Playwright assertion (RED → GREEN)

### [x] 2.1 Extend the Mailpit helper to return full email body

**Created:** 2026-05-23T06:06:12Z
**Completed:** 2026-05-23T06:53:42Z

**Why:** The OTP-absence assertion needs the raw HTML and plain-text bodies of
the email. The current `waitForMagicLink` returns only the extracted link URL.
Mailpit's `/api/v1/message/{id}` already returns both `HTML` and `Text` fields
in the same response that `extractMagicLink` already processes — surfacing them
costs nothing extra.

**Prerequisites:** Task 1.2 (stack is configured so Phase 2 tests go GREEN
immediately after Phase 1).

**Decisions:**
- Change `waitForMagicLink` return type from `Promise<string>` to
  `Promise<{ link: string; html: string; text: string }>`. The single call site
  (`auth.spec.ts` line 23) is updated in Task 2.2.
- Add `Text: string` to the `MailpitMessage` interface. Mailpit always returns
  this field; it is not optional.
- `extractMagicLink` remains a private helper; it does not need to change.
- The `waitForMagicLink` return statement changes from `return
  extractMagicLink(msg.HTML, email)` to `return { link: extractMagicLink(msg.HTML,
  email), html: msg.HTML, text: msg.Text }`.

**Files:**
- `web/e2e/helpers/mailpit.ts` (modify)

**Steps:**
1. In `web/e2e/helpers/mailpit.ts`:
   a. Add `Text: string` to `MailpitMessage`.
   b. Change the `waitForMagicLink` signature to return
      `Promise<{ link: string; html: string; text: string }>`.
   c. Update the `return` statement inside the `if (match)` block to:
      ```typescript
      return { link: extractMagicLink(msg.HTML, email), html: msg.HTML, text: msg.Text };
      ```
2. Confirm `pnpm check` reports a type error on `auth.spec.ts` line 23
   (`const link = await waitForMagicLink(email)` — `string` is no longer
   assignable). This is expected and will be resolved in Task 2.2.

**Verify:** `cd web && pnpm check` — expect one type error on `auth.spec.ts`
line 23 (the call site update is Task 2.2's job).

### [x] 2.2 Add OTP-absence assertions to the happy-path Playwright test

**Created:** 2026-05-23T06:06:12Z
**Completed:** 2026-05-23T06:56:13Z

**Why:** A machine-verifiable assertion that the email contains no six-digit
numeric token is the only way to guarantee the template change is effective
end-to-end. Without it, a GoTrue upgrade that resets the custom template would
go undetected until the first user complained.

**Prerequisites:** Task 2.1 (`waitForMagicLink` now returns
`{ link: string; html: string; text: string }`; `auth.spec.ts` line 23 still
reads `const link = await waitForMagicLink(email)` and fails `pnpm check`).

**Decisions:**
- Regex: `/\b\d{6}\b/` — word-boundary-delimited six-digit sequence. Catches
  GoTrue's default token range (000000–999999) without false-positives on longer
  numeric strings (port numbers, timestamps, JWT fragments) that may appear in
  the confirmation URL.
- Assert on both `html` and `text` bodies: the plain-text MIME part is derived
  from the HTML body by GoTrue, but asserting both is belt-and-braces and costs
  nothing.
- The existing assertion `await page.goto(link)` stays in place immediately
  after the new assertions, so the test still exercises the full sign-in flow.
- The anti-enumeration test (`magic-link non-2xx still lands on /auth/check`)
  does not call `waitForMagicLink` and needs no change.

**Files:**
- `web/e2e/auth.spec.ts` (modify)

**Steps:**
1. In `web/e2e/auth.spec.ts`, change line 23 from:
   ```typescript
   const link = await waitForMagicLink(email);
   ```
   to:
   ```typescript
   const { link, html, text } = await waitForMagicLink(email);
   ```
   Confirm `pnpm check` now passes (type error from Task 2.1 is resolved).
2. Immediately before `await page.goto(link)`, add:
   ```typescript
   expect(/\b\d{6}\b/.test(html)).toBe(false);
   expect(/\b\d{6}\b/.test(text)).toBe(false);
   ```
3. Run the full e2e suite: `cd web && pnpm test:e2e`.
   Both assertions should pass GREEN immediately because the stack was
   reconfigured in Phase 1.
4. Run the full check: `./scripts/check.sh`.

**Verify:** `cd web && pnpm check` — no type errors. · `cd web && pnpm test:e2e`
— all tests green, including the two new assertions. · `./scripts/check.sh`
— fully green.

## Phase 3 — Fix template delivery

### [x] 3.1 Move template to web/static and remove dead volume mount

**Created:** 2026-05-23T07:15:00Z
**Completed:** 2026-05-23T07:30:00Z

**Why:** GoTrue treats `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` as a URL, not a
filesystem path. When the value is `/gotrue/templates/magic_link.html`, GoTrue
prepends `GOTRUE_SITE_URL` (`http://localhost:5173`) and does an HTTP GET.
The Phase 1 volume mount was never read; GoTrue fell back to its built-in
default template (which includes `{{ .Token }}`) every time. Moving the file
to `web/static/` is the first half of the fix — it puts the template where both
SvelteKit (production) and the static sidecar (dev, Task 3.2) can serve it.

**Prerequisites:** Tasks 1.1 and 1.2 complete.

**Decisions:**
- Template destination: `web/static/gotrue/templates/magic_link.html`.
- Remove the `volumes` block from the `gotrue` service entirely.
- Delete `gotrue/templates/` from the repo root.
- The env var value is updated in Task 3.2 once the sidecar approach is decided.

**Files:**
- `web/static/gotrue/templates/magic_link.html` (created — moved from `gotrue/templates/magic_link.html`)
- `gotrue/templates/magic_link.html` (deleted)
- `docker-compose.yml` (modified — removed `volumes` block from `gotrue` service)

**Note:** After this task, GoTrue still fell back to the default template in dev
because `http://localhost:5173` is unreachable from inside Docker (see Task 3.2).

### [x] 3.2 Add nginx static sidecar to serve the template within Docker

**Created:** 2026-05-23T07:45:00Z
**Completed:** 2026-05-23T07:50:00Z

**Why:** Inside a Docker container, `localhost` resolves to the container itself,
not the host machine. With `GOTRUE_SITE_URL: http://localhost:5173`, GoTrue
constructs `http://localhost:5173/gotrue/templates/magic_link.html` and tries to
GET it — but `pnpm dev` runs on the host, not inside Docker, so the connection is
refused. GoTrue silently falls back to its built-in default template. This was
confirmed from GoTrue logs (`dial tcp [::1]:5173: connect: connection refused`)
and from reading the source (`mailme/mailme.go`: `http.Client.Get(url)` with
silent fallback on error).

The fix is a dedicated `static` service in `docker-compose.yml` using
`nginx:alpine`, serving `./web/static/` from within the Compose network. The
env var is changed to a full `http://static/...` URL so GoTrue uses it verbatim
(the "starts with http → use as-is" branch in `mailme.go`) without prepending
`GOTRUE_SITE_URL`. The sidecar is always reachable regardless of whether
`pnpm dev` is running.

**Prerequisites:** Task 3.1 (`web/static/gotrue/templates/magic_link.html` exists).

**Decisions:**
- Sidecar image: `nginx:alpine` — minimal, no configuration needed for plain
  static file serving.
- Service name `static` — short, descriptive, and used as the hostname in the
  template URL.
- Full URL in env var: `http://static/gotrue/templates/magic_link.html`. Using
  the full URL prevents GoTrue from prepending `GOTRUE_SITE_URL` (which would
  re-introduce the localhost problem). Confirmed by source: values starting with
  `http` are used as-is.
- No port mapping needed — the nginx container is internal to the Compose
  network; nothing needs to reach it from the host.
- Production compose (`docker-compose.prod.yml`) does not need this sidecar:
  `GOTRUE_SITE_URL` will be the real domain, the relative-path form
  (`/gotrue/templates/magic_link.html`) is correct there, and the static file
  is served by the production web container.

**Files:**
- `docker-compose.yml` (modify — add `static` service; update
  `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`; add `static` to `gotrue` depends_on)

**Steps:**
1. In `docker-compose.yml`, add after the `mailpit` service:
   ```yaml
   static:
     image: nginx:alpine
     volumes:
       - ./web/static:/usr/share/nginx/html:ro
   ```
2. Change `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` in the `gotrue` environment block
   to:
   ```yaml
   GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: http://static/gotrue/templates/magic_link.html
   ```
3. Add `static` to the `gotrue` service `depends_on`:
   ```yaml
   static:
     condition: service_started
   ```
4. Restart: `docker compose up -d --force-recreate gotrue static`.
5. Verify the sidecar serves the file:
   ```bash
   docker compose exec static wget -qO- http://localhost/gotrue/templates/magic_link.html
   ```
   Should return the HTML. No `Error loading template` in GoTrue logs.
6. Request a magic link in the browser; check Mailpit — email must show
   "Sign in to Cairn" with no six-digit code.
7. Run `./scripts/check.sh` — fully green.

**Verify:** `docker compose exec static wget -qO- http://localhost/gotrue/templates/magic_link.html` — returns HTML. · `docker compose logs --tail=5 gotrue` after a magic-link request — no `Error loading template`. · Mailpit shows custom template, no OTP. · `./scripts/check.sh` — fully green.

## Phase 4 — Email-client compatibility

### [x] 4.1 Rewrite template using email-safe HTML

**Created:** 2026-05-23T09:30:00Z
**Completed:** 2026-05-23T09:35:00Z

**Why:** Mailpit's HTML checker scored the initial template at 84%. The
failures were all CSS properties that email clients strip: body-level layout
styles, `display:inline-block` on the button link, CSS `background` without
an HTML attribute fallback, `border-radius`, `margin` for spacing, and
`font-weight:bold` without a tag fallback. Because webmail clients embed the
email inside their own HTML document, they replace `<body>` with a `<div>` and
discard any styles on it.

**Prerequisites:** Task 1.1 (template file exists and is being delivered).

**Decisions:**
- Table-based layout for centering and the button — the only layout model with
  broad email client support.
- `padding` on `<td>` for spacing, not `margin`.
- `bgcolor="#111"` attribute on the button `<td>` alongside `style="..."` —
  attribute survives clients that strip CSS.
- Button is a nested `<table>` containing the `<a>`, not an `<a>` with
  `display:inline-block`.
- `<b>` tag for bold text, not `font-weight:bold` alone.
- `font-family` and `color` on the wrapper `<td>`, not on `<body>`.
- `<body>` carries only `margin:0;padding:0`.
- `border-radius` removed — Outlook cannot render it; square corners are
  acceptable at this stage.
- No `<style>` block — stripped by Gmail and other webmail clients.

**Files:**
- `web/static/gotrue/templates/magic_link.html` (rewritten)
- `docs/email-html.md` (created — records the conventions for all future
  Cairn email templates)

**Verify:** Mailpit HTML Check score ≥ 90%. Remaining warnings are `<body>`
element (structural, unfixable) and `margin` on `<h2>` (cosmetic only).
