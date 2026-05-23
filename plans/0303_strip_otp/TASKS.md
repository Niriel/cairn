# Tasks

## Reference skills and docs

- **`docs/testing.md`** — three test layers; Playwright covers end-to-end email
  body assertions.
- **`docs/deployment.md`** — "Auth surface: pre-deploy checklist" for context on
  why this must land before step 14.

## Phase 1 — template file and stack wiring

### [ ] 1.1 Create the custom magic-link HTML template

**Created:** 2026-05-23T06:06:12Z
**Completed:**

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

### [ ] 1.2 Wire the template into docker-compose.yml

**Created:** 2026-05-23T06:06:12Z
**Completed:**

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

### [ ] 2.1 Extend the Mailpit helper to return full email body

**Created:** 2026-05-23T06:06:12Z
**Completed:**

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

### [ ] 2.2 Add OTP-absence assertions to the happy-path Playwright test

**Created:** 2026-05-23T06:06:12Z
**Completed:**

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
