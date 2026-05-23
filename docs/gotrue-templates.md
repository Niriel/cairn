# GoTrue email templates

GoTrue supports custom HTML templates for every transactional email it sends
(magic links, invites, password resets, etc.). Cairn uses a custom magic-link
template to strip the six-digit OTP token from the email — the token creates a
social-engineering surface and Cairn has no code-entry screen anyway.

## How GoTrue loads a template

The template configuration is a set of env vars, one per email type:

```
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK
GOTRUE_MAILER_TEMPLATES_INVITE
GOTRUE_MAILER_TEMPLATES_CONFIRMATION
GOTRUE_MAILER_TEMPLATES_RECOVERY
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE
GOTRUE_MAILER_TEMPLATES_REAUTHENTICATION
```

**GoTrue always fetches templates over HTTP.** There is no file-path support.
When an env var is set, GoTrue issues an `http.Client.Get(url)` at email-send
time (not at startup). The URL is constructed as follows:

- If the value **starts with `http`**, it is used as-is.
- Otherwise, GoTrue prepends `GOTRUE_SITE_URL`.

So `/gotrue/templates/magic_link.html` with `GOTRUE_SITE_URL=https://cairn.app`
becomes `https://cairn.app/gotrue/templates/magic_link.html`.

If the HTTP GET fails (connection refused, 4xx, 5xx), GoTrue logs the error and
**silently falls back to its built-in default template**, which includes the OTP
token (`{{ .Token }}`). The email is still sent — there is no hard failure.

Templates are cached for 10 seconds after a successful fetch.

## Template syntax

GoTrue uses Go's `text/template`. The variables available in magic-link emails:

| Variable | Value |
|---|---|
| `{{ .ConfirmationURL }}` | The full magic-link URL (use this for the sign-in button) |
| `{{ .Token }}` | The six-digit OTP code (do not reference this in Cairn's template) |
| `{{ .SiteURL }}` | The value of `GOTRUE_SITE_URL` |

The plain-text MIME part is generated automatically by stripping HTML tags from
the rendered HTML body. A separate text template is not required, and Cairn does
not use one.

## How Cairn wires it up

### Template file

The template lives at `web/static/gotrue/templates/magic_link.html`. SvelteKit
(and, in production, the built static bundle served by Caddy) serves everything
under `web/static/` at its relative path, so the file is available at
`/gotrue/templates/magic_link.html` on whatever origin `GOTRUE_SITE_URL` points
to.

The template uses only `{{ .ConfirmationURL }}` — `{{ .Token }}` does not appear
anywhere in the file. This is verified in CI by a Playwright assertion
(`\b\d{6}\b` on both the HTML and plain-text MIME parts; see
`web/e2e/auth.spec.ts`).

### Dev stack (docker-compose.yml)

The dev compose sets:

```yaml
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: /gotrue/templates/magic_link.html
```

With `GOTRUE_SITE_URL: http://localhost:5173`, GoTrue constructs the URL
`http://localhost:5173/gotrue/templates/magic_link.html`. The catch: **inside a
Docker container, `localhost` is the container itself**, not the host machine
where `pnpm dev` is running. An HTTP GET to `localhost:5173` from inside the
GoTrue container hits nothing and gets "connection refused", so GoTrue falls back
to the default template.

The fix is a dedicated `static` service in `docker-compose.yml` — an
`nginx:alpine` container that serves `./web/static/` at its root:

```yaml
static:
  image: nginx:alpine
  volumes:
    - ./web/static:/usr/share/nginx/html:ro
```

Because all services in a Compose project share a network, GoTrue can reach the
nginx container by its service name. The env var is set to the full URL so GoTrue
doesn't prepend `GOTRUE_SITE_URL` (which would produce the broken localhost URL):

```yaml
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: http://static/gotrue/templates/magic_link.html
```

This means the template is always available regardless of whether `pnpm dev` is
running.

### Production (docker-compose.prod.yml)

In production, `GOTRUE_SITE_URL` is the real domain
(e.g. `https://cairn.example.com`). The relative path form
`/gotrue/templates/magic_link.html` is correct there: GoTrue prepends the site
URL and the static file is served by the production web container (or Caddy,
whichever handles static assets). No `static` sidecar is needed in production.

The production compose file is step 14's responsibility and is not covered here.

## Troubleshooting

**The email still shows a six-digit code.** GoTrue silently fell back to the
built-in default. Check `docker compose logs gotrue` for a line like:

```
Error loading template from ...: ...
```

Common causes:

- The `static` service is not running (`docker compose up -d static`).
- The template file is missing from `web/static/gotrue/templates/`.
- The env var is pointing at the wrong URL.

**Confirm the static server is serving the file:**

```bash
docker compose exec static wget -qO- http://localhost/gotrue/templates/magic_link.html
```

Should return the HTML. If it does and GoTrue still fails, check the env var
value in `docker compose config gotrue`.
