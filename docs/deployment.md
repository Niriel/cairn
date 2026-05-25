# Deployment

This document describes how Cairn runs in production: the Hetzner VPS setup, how the same containers from development are configured for the public internet, how TLS and the reverse proxy are wired up, how backups work, and how releases happen. It assumes `architecture.md` (the stack) and `development.md` (the local equivalents).

The guiding principle: **production is development plus four things — a real domain, a reverse proxy with TLS, real email, and the cookie/JWT shim.** Everything else is the same containers with different environment variables.

## What you need before you start

- **A Hetzner Cloud account.** A CX22 instance in a German data center.
- **A domain name** you control, with the ability to add DNS records. Any registrar that doesn't make you queasy works; [Gandi](https://www.gandi.net/) and [Namecheap](https://www.namecheap.com/) are fine choices.
- **An SSH key pair.** If you don't already have one, `ssh-keygen -t ed25519`. Add the public key to your Hetzner account.
- **A transactional email provider account.** [Mailjet](https://www.mailjet.com/) (French) or [Scaleway TEM](https://www.scaleway.com/en/transactional-email-tem/) (also French) are good EU-based choices. You'll need an SMTP host, port, username, and password.

## The VPS

If you've already provisioned the shared-infrastructure box, skip ahead to "DNS." If not, this is the short version of bringing one up.

### Provisioning

In the Hetzner Cloud console: create a new server. Image: Ubuntu LTS (24.04 at time of writing). Type: CX22 (sufficient for Cairn plus several other small apps). Location: any German data center (Falkenstein or Nuremberg). Add your SSH key. Create.

You'll get a public IPv4 and IPv6 address. Note them.

### First-login hardening

SSH in as root the first time, then immediately do the following. Generic Linux server hygiene; nothing Cairn-specific.

```bash
# Create a non-root user
adduser cairn
usermod -aG sudo cairn

# Copy your authorized_keys to the new user
mkdir -p /home/cairn/.ssh
cp /root/.ssh/authorized_keys /home/cairn/.ssh/
chown -R cairn:cairn /home/cairn/.ssh
chmod 700 /home/cairn/.ssh
chmod 600 /home/cairn/.ssh/authorized_keys

# Disable root SSH and password auth
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Install unattended security upgrades
apt update && apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Basic firewall: SSH, HTTP, HTTPS only
apt install -y ufw
ufw allow OpenSSH
ufw allow http
ufw allow https
ufw --force enable
```

From now on, log in as `cairn`, not root. Test that `ssh cairn@<ip>` works *before* logging out of your root session.

### Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker cairn
# Log out and back in for the group change to take effect
```

That's it. Compose comes bundled with modern Docker.

## DNS

A single A record (and an AAAA record for IPv6) pointing at the VPS:

```
cairn.<your-domain>     A    <vps-ipv4>
cairn.<your-domain>     AAAA <vps-ipv6>
```

One subdomain — that's all Cairn needs. The web app, the API, and the auth service are all served from this single origin via path-prefix routing in Caddy. See `architecture.md` for the rationale (single-origin keeps cookies simple and avoids CORS entirely).

If you're going to host other apps on the same VPS, give each its own subdomain.

DNS propagation usually takes a few minutes. `dig cairn.<your-domain>` should return your VPS IP before you proceed.

## The deployment

The repo lives on the VPS at `/home/cairn/cairn`. Updates are `git pull && docker compose up -d`. There's no fancy CI/CD pipeline for v1; this is a small project and the manual flow is honest about what's happening.

### File layout on the VPS

```
/home/cairn/
├── cairn/                          ← the git checkout
│   ├── docker-compose.yml          ← shared with dev
│   ├── docker-compose.prod.yml     ← production overrides
│   ├── .env.prod                   ← production secrets (NOT in git)
│   ├── caddy/
│   │   └── Caddyfile.prod
│   ├── sidecar/                    ← avatar upload / delete sidecar
│   ├── db/migrations/
│   ├── web/                        ← the SvelteKit project
│   └── ...
└── backups/                        ← restic cache
```

`.env.prod` holds the production secrets. It is created on the VPS by hand (or copied from a password manager) and is never committed to git. A safer alternative is to use [SOPS](https://github.com/getsops/sops) with an age key for encrypted-in-git secrets; that's worth doing once Cairn has more than one operator.

### Production compose overrides

`docker-compose.prod.yml` layers on top of the dev compose:

```yaml
services:
  postgres:
    ports: []                   # don't expose Postgres to the internet
    restart: unless-stopped

  postgrest:
    ports: []                   # only Caddy reaches it
    restart: unless-stopped

  gotrue:
    ports: []                   # only Caddy reaches it
    environment:
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_FROM}
      GOTRUE_MAILER_AUTOCONFIRM: "false"      # require email verification
      GOTRUE_SITE_URL: https://cairn.${DOMAIN}
      GOTRUE_URI_ALLOW_LIST: https://cairn.${DOMAIN}/auth/callback
    restart: unless-stopped

  mailpit:
    profiles: ["dev"]           # excluded in production

  web:
    build: ./web
    # the SvelteKit static bundle, served by a tiny nginx inside the image
    ports: []
    restart: unless-stopped

  sidecar:
    build: ./sidecar
    # the avatar upload sidecar (see avatars.md); validates, resizes to
    # 256x256 WebP, writes /srv/cairn/avatars/{uid}.webp, calls
    # bump_avatar_version on PostgREST.
    ports: []
    volumes:
      - /srv/cairn/avatars:/srv/cairn/avatars   # read-write
    environment:
      POSTGREST_URL: http://postgrest:3000
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
    restart: unless-stopped
    depends_on: [postgrest]

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro
      - /srv/cairn/avatars:/srv/cairn/avatars:ro   # static avatar serving
      - caddy_data:/data
      - caddy_config:/config
    environment:
      DOMAIN: ${DOMAIN}
      JWT_COOKIE_NAME: cairn_session
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

Started with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

Notes:

- **No internal services are exposed.** Postgres, PostgREST, GoTrue, and the web container have empty `ports` lists in production. Caddy is the only public entry point.
- **`GOTRUE_SITE_URL` is the web origin**, not the API. The magic-link callback lands in the browser, not in a deep link.
- **Mailpit is excluded** via the `profiles` mechanism — it's a dev tool and has no place in production.
- **`GOTRUE_MAILER_AUTOCONFIRM: false`** flips the safety back on: signing up requires clicking a confirmation email. Magic-link login is unaffected.

### The Caddyfile

`caddy/Caddyfile.prod` — single origin, path routing, cookie shim:

```
cairn.{$DOMAIN} {
    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
    }

    # ── API: /api/* → PostgREST, with cookie → bearer translation ──
    handle_path /api/* {
        @hasSession header_regexp Cookie cairn_session=([^;]+)
        request_header Authorization "Bearer {http.regexp.1}"
        reverse_proxy postgrest:3000
    }

    # ── Auth: /auth/* → GoTrue, with response-side JWT → cookie translation ──
    handle_path /auth/* {
        reverse_proxy gotrue:9999 {
            @loginResponse status 200
            # When GoTrue returns a JSON body containing access_token,
            # strip it out and re-emit it as an HttpOnly cookie.
            handle_response @loginResponse {
                # (Pseudocode — the actual implementation uses a small
                # caddy-server response handler module that JSON-parses
                # the body, sets:
                #
                #   Set-Cookie: cairn_session=<jwt>;
                #               HttpOnly; Secure; SameSite=Lax;
                #               Path=/; Max-Age=2592000
                #
                # and forwards the rest of the body unchanged.)
            }
        }
    }

    # ── Logout: DELETE /auth/session clears the cookie ──
    @delete_session {
        method DELETE
        path /auth/session
    }
    handle @delete_session {
        header Set-Cookie "cairn_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
        respond 204
    }

    # ── Avatars: GET /avatars/*.webp → static files; POST /avatars and
    #            DELETE /avatars/me → the avatar sidecar (see avatars.md) ──
    @avatar_static {
        method GET
        path /avatars/*.webp
    }
    handle @avatar_static {
        root * /srv/cairn
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }
    @avatar_sidecar path /avatars /avatars/me
    handle @avatar_sidecar {
        # Same cookie → bearer translation as /api/*; the sidecar gates
        # uploads on the user's JWT (see avatars.md).
        @hasSession header_regexp Cookie cairn_session=([^;]+)
        request_header Authorization "Bearer {http.regexp.1}"
        reverse_proxy avatars:8080
    }

    # ── Web app: everything else ──
    handle {
        reverse_proxy web:80
    }
}
```

The cookie-shim block is shown in pseudocode because the exact Caddy syntax depends on which response-handler plugin we use; the canonical version lives in the repo. The behaviour is the contract: **the JavaScript in the browser never sees the JWT**, and PostgREST sees a normal `Authorization: Bearer …` header.

### `.env.prod`

```
DOMAIN=example.com                  # the parent domain; cairn. is computed
POSTGRES_PASSWORD=<long-random>
AUTHENTICATOR_PASSWORD=<long-random>
GOTRUE_PASSWORD=<long-random>
JWT_SECRET=<at-least-32-bytes>
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=no-reply@example.com
```

Generate the random values with `openssl rand -hex 32`. Store the file in your password manager — losing it means losing the database.

## Initial migration

Once the stack is up:

```bash
cd /home/cairn/cairn
./scripts/migrate.sh   # uses .env.prod automatically
```

Same script as in development, against the production Postgres. There is no production seed data — the database starts empty and the first user to sign up is genuinely the first user.

## Backups

Encrypted, deduplicated, off-machine. The setup uses [Restic](https://restic.net/) pushing to a separate **Hetzner Storage Box** (~€4/month for 1 TB).

### One-time setup

On the Storage Box (configured in the Hetzner console), enable SSH. On the VPS:

```bash
sudo apt install -y restic

# Generate a strong repository password and STORE IT SOMEWHERE SAFE.
RESTIC_PASSWORD=<long-random>

# Initialize the repo
RESTIC_PASSWORD=$RESTIC_PASSWORD \
  restic -r sftp:u123456@u123456.your-storagebox.de:/cairn init
```

The repository password is encryption at rest. It is *not* stored on the VPS. You hold this password; the Storage Box doesn't.

### The nightly job

A small script, run by cron at 03:00 UTC:

```bash
#!/usr/bin/env bash
set -euo pipefail

export RESTIC_REPOSITORY=sftp:u123456@u123456.your-storagebox.de:/cairn
export RESTIC_PASSWORD_FILE=/home/cairn/.restic-password
export DUMP_DIR=/home/cairn/backups

mkdir -p "$DUMP_DIR"

docker compose -f /home/cairn/cairn/docker-compose.yml \
               -f /home/cairn/cairn/docker-compose.prod.yml \
               --env-file /home/cairn/cairn/.env.prod \
               exec -T postgres pg_dump -U cairn -d cairn -Fc \
  > "$DUMP_DIR/cairn-$(date -u +%Y%m%d).dump"

restic backup "$DUMP_DIR"

restic forget --prune \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 12

find "$DUMP_DIR" -name "cairn-*.dump" -mtime +2 -delete
```

`pg_dump -Fc` produces a compressed custom-format dump. Restic deduplicates against the previous snapshot, so the actual upload is small.

### Restoring

```bash
restic -r sftp:... restore latest --target /tmp/restore
ls /tmp/restore/home/cairn/backups/

docker compose ... exec -T postgres pg_restore -U cairn -d cairn --clean \
  < /tmp/restore/home/cairn/backups/cairn-YYYYMMDD.dump
```

Test restore at least once after setting up backups, and again every six months. A backup you haven't tested is folklore, not a backup.

## Releases

A release is: commit and push to `main`, SSH to the VPS, pull, restart.

```bash
ssh cairn@<vps>
cd cairn
git pull
./scripts/migrate.sh                # if there are new migrations
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               --env-file .env.prod build web   # rebuild the static bundle
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               --env-file .env.prod up -d
```

`docker compose up -d` only restarts containers whose configuration or image has changed, so this is fast — the database, auth, and API stay running while the web bundle swaps in.

The web bundle is built inside the `web` container (the Dockerfile runs `pnpm install && pnpm build`). This means a release is reproducible from the git checkout alone — no separate build pipeline, no artifact store, no host-side Node install. If `git pull` brings down web changes, the rebuild includes them; if it doesn't, the existing image is reused.

For Cairn at this stage, this is enough. If releases ever become frequent or risky enough that "SSH and pull" is a problem, GitHub Actions can do the same thing on every push to `main`.

## Service-worker considerations

A PWA with a service worker has one operational gotcha worth knowing about: **a service worker that has cached the previous version of the app shell will keep serving it until the new worker activates and the user reloads.** The user can be running yesterday's bundle for an extra session after a release.

Two countermeasures, both in the SvelteKit project:

- The build emits a content-hashed bundle. The service worker compares the hash against its cache and triggers an update when it changes.
- On detecting an update, the app shows a small *"A new version is available — refresh"* affordance (non-modal, dismissable). It auto-applies on next launch regardless.

This is invisible day-to-day. It only matters if you ship a release, immediately push a hotfix, and want to be sure users actually get the hotfix. For Cairn's release cadence, the lazy update path is fine.

## Monitoring

Minimal in v1:

- **Container restarts.** `docker compose ps` shows status. If anything is in a restart loop, `docker compose logs <service>` is the next step.
- **Disk usage.** `df -h` periodically. Postgres data and the local backup dumps grow over time. The CX22's 40 GB is generous for Cairn but can be eaten by other apps on the same VPS.
- **A cron-driven email** if backups fail. The backup script can be wrapped to email on non-zero exit.

A real monitoring stack ([Uptime Kuma](https://github.com/louislam/uptime-kuma), self-hosted Sentry) is reasonable to add when Cairn matters enough that an outage matters. It does not for v1.

## Operational tasks

**OS updates.** Unattended-upgrades handles security patches automatically. Major version upgrades and reboots are manual:

```bash
sudo apt update && sudo apt upgrade
sudo reboot   # if the kernel was updated
```

The stack comes back automatically because of `restart: unless-stopped`.

**Container image updates.** New PostgREST, GoTrue, Postgres versions come out periodically. Update the version tags in `docker-compose.yml`, test on your laptop, then deploy:

```bash
docker compose pull
docker compose -f ... up -d
```

For Postgres major version upgrades (e.g. 16 → 17), there's an extra dance: dump, upgrade the container, restore. Don't skip this; major upgrades are not in-place.

**Rotating secrets.**

- **`JWT_SECRET`** is the most painful one — rotating it logs every user out, because their existing JWTs become invalid. Communicate before doing this.
- **Database role passwords** can be rotated with `ALTER ROLE ... WITH PASSWORD '...'` in psql, then update `.env.prod` and restart the affected services.

## Auth surface: pre-deploy checklist

The login screen at `web/src/lib/auth/components/LoginRequest.svelte` ships a dev login shortcut — three "Sign in as alice/bob/carol" buttons that call `devPasswordSignIn(email, password)` against GoTrue's `/auth/token?grant_type=password`. The UI is gated by `isDevLoginShortcutEnabled()`, which evaluates to `false` in prod builds (`import.meta.env.DEV` is constant-folded), so the buttons do not render. Previously, the underlying code still shipped in the prod client JS bundle: a static `{#if}` block kept the emails, the "Sign in as …" template fragment, and the `devPasswordSignIn` helper alive across tree-shaking, because the minifier can't prove a Svelte runtime branch is dead across the component boundary. Decorative, not exploitable — the helper just hit an endpoint that's also reachable with `curl` — but it did leak the seed emails and the dev password as plaintext strings in `web/build/_app/immutable/`. Landed in `plans/0301_gate_dev_login/`: the dev shortcut now lives in its own component (`DevShortcuts.svelte`) loaded via a literal `if (import.meta.env.DEV)` dynamic import. Vite folds the condition to `false` in prod, the `import()` becomes dead code, and the whole module drops from the prod graph. See `development.md` → "Gating dev-only UI so it doesn't ship to prod" for the general pattern.

Two things still must be confirmed before opening Cairn to public traffic:

1. **GoTrue password grant must be unreachable for real accounts in prod.** The `/auth/token?grant_type=password` endpoint is server-side; whether the client bundle ships a helper for it is decorative — an attacker can hit it with `curl` either way. Verify in the GoTrue config that no real prod user can be password-signed-in. If a real admin account can, the bundle issue is the lesser problem and we have a separate vulnerability.

2. **`VITE_DEV_LOGIN_PASSWORD` must be unset when `pnpm build` runs for prod.** Vite inlines every `import.meta.env.VITE_*` reference at build time as a string literal — with no warning if a dev-only var leaks into the build environment. The structural fix above keeps `DevShortcuts.svelte` (and its env-var read) out of the prod graph, but if anyone ever adds another caller of `VITE_DEV_LOGIN_PASSWORD` outside the gated module, the value would re-leak. Grep `web/build/_app/immutable/` for the current dev password value before each prod release as a belt-and-braces watch.

## What's not here yet

Honest about the gaps:

- **No staging environment.** Dev → prod, no in-between. Defensible at this size; the cost of a staging VPS plus the maintenance burden isn't justified by Cairn's risk profile.
- **No automated rollback.** A bad release means manually `git checkout`ing the previous commit and running `up -d` again. Migrations are forward-only, which means a release that includes both a schema change and a bug requires more care.
- **No load shedding or rate limiting.** Caddy can do basic rate limiting via plugins; nothing is configured. If we ever get attention from the wrong people, this becomes urgent.
- **No SOPS-encrypted secrets in git.** Worth doing once there's more than one operator.

These are all "v2 when needed" items, not "v1 must-haves."
