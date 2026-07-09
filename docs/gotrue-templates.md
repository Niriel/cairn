# GoTrue email templates

GoTrue supports custom HTML templates for every transactional email it sends
(magic links, invites, password resets, etc.). Cairn uses a custom magic-link
template to brand the email and to present the six-digit OTP token as a code the
user can type on Cairn's code-entry screen (`/auth/check`). The token does carry
a social-engineering surface; that is acknowledged and mitigated by the e-mail
line "Don't share this code with anyone."

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
**silently falls back to its built-in default template**. The email is still
sent — there is no hard failure. Because Cairn's own template now also shows the
code, the tell of a fallback is no longer "a six-digit code appears" — it's the
_wrong_ template rendering: the unbranded GoTrue default, missing Cairn's layout
and the "Don't share this code with anyone." line.

Templates are cached for 10 seconds after a successful fetch.

## Template syntax

GoTrue uses Go's `text/template`. The variables available in magic-link emails:

| Variable                 | Value                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| `{{ .ConfirmationURL }}` | The full magic-link URL (use this for the sign-in button)                 |
| `{{ .Token }}`           | The six-digit OTP code (presented as a typeable code in Cairn's template) |
| `{{ .SiteURL }}`         | The value of `GOTRUE_SITE_URL`                                            |

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

The template uses `{{ .ConfirmationURL }}` for the sign-in button and
`{{ .Token }}` for the typeable code. This is verified in CI by a Playwright
assertion that the six-digit code (`\b\d{6}\b`) **is present** in both the HTML
and plain-text MIME parts; see `web/e2e/auth.spec.ts`.

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

In production, use the **internal** URL form — point GoTrue straight at the
`web` container on the Compose network:

```yaml
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: http://web/gotrue/templates/magic_link.html
```

The `web` container serves the built static bundle (including
`build/gotrue/templates/magic_link.html`) on `:80`, so this resolves without
leaving the internal network. **Prefer this over the relative-path form**
(`/gotrue/templates/magic_link.html`, which GoTrue would resolve against
`GOTRUE_SITE_URL = https://cairn.${DOMAIN}`): the relative form makes the
template fetch depend on the public TLS cert being issued. On a cold box, the
first sign-in can race ACME — if Caddy hasn't yet obtained the Let's Encrypt
cert, GoTrue's HTTPS fetch of the template fails, it silently falls back to its
built-in default, and the email ships unbranded — the GoTrue default layout,
without Cairn's styling or the "Don't share this code with anyone." line. The
internal
`http://web/...` URL sidesteps the cert entirely. No `static` sidecar is needed
in production.

The production compose file is step 15's responsibility (the
`1500_production_rollout` plan) and now exists as `docker-compose.prod.yml`.

## Troubleshooting

**The email arrives unbranded (GoTrue's default layout, no Cairn styling or
"Don't share this code with anyone." line).** GoTrue silently fell back to the
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
