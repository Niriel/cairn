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

From now on, log in as `cairn`, not root. Test that `ssh cairn@<ip>` works _before_ logging out of your root session.

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

The split between dev and prod is structural rather than override-by-override: **`docker-compose.yml` is the prod-safe base** — it publishes _no_ ports and defines only the services common to both environments. The dev-only pieces (every published port, the `static` nginx and `mailpit` services, the dev GoTrue env) live in **`docker-compose.override.yml`**, which Compose auto-loads for a bare `docker compose up` but which production never loads. **`docker-compose.prod.yml`** then adds only what production needs on top of the base. Both files are real and kept in sync by this plan — read them rather than a pseudocode copy here.

The production overlay (`docker-compose.prod.yml`) is started with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The services in the production stack:

- **postgres / postgrest / gotrue** — internal only; reached by service name on the Compose network. Postgres additionally publishes `127.0.0.1:5432:5432` (loopback only) so `scripts/migrate.sh` can reach it from the host; it is not internet-reachable.
- **auth-proxy** — a small Cairn-shaped **BFF** (not just the response-side half of the old cookie/JWT shim): it plants the **dual session cookie** (durable revocable refresh token + short-lived access JWT), exposes `POST /auth/refresh` (refresh-token exchange with rotation + reuse detection) and `POST /auth/signout` (server-side revocation; `?scope=global` for sign-out-everywhere), enforces a CSRF header on its state-changing endpoints, and rate-limits sign-in. It still reuses the dev-proxy logic and the shared `auth-paths.ts` narrowing/constant lists. Caddy routes `/auth/*` to it; it forwards to `gotrue:9999`. See `architecture.md` → "JWT storage".
- **web** — the SvelteKit static bundle, built in production mode and served by Caddy inside the image (see `web/Dockerfile`). Also serves `/gotrue/templates/*`.
- **sidecar** — the avatar upload sidecar on port `3001` (see `avatars.md`); validates, resizes to 256×256 WebP, writes `/srv/cairn/avatars/{uid}.webp`, calls `bump_avatar_version` on PostgREST.
- **caddy** — the only public entry point, publishing `80`/`443`, terminating TLS, and mounting `caddy/Caddyfile.prod`.

Notes:

- **No internal services are exposed.** The base publishes nothing; the prod overlay publishes only Caddy's `80`/`443` and Postgres's loopback `5432`. (Docker-published ports bypass ufw's `INPUT` filter, so "publish nothing by default" is the safe posture — see Task 3.1 in the rollout plan.)
- **`GOTRUE_SITE_URL` is the web origin**, not the API. The magic-link callback lands in the browser, not in a deep link.
- **Mailpit and the `static` sidecar are dev-only** — they live in `docker-compose.override.yml` and are absent from the prod stack.
- **`GOTRUE_MAILER_AUTOCONFIRM: false`** flips the safety back on: signing up requires clicking a confirmation email. Magic-link login is unaffected.

### The Caddyfile

The canonical production reverse-proxy config is the real `caddy/Caddyfile.prod` in the repo — read it rather than a pseudocode copy here. Its shape, single origin `cairn.{$DOMAIN}` with automatic Let's Encrypt TLS:

- `encode gzip` and the security headers (HSTS `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`).
- **`/api/*`** → `postgrest:3000` via `handle_path` (strips the `/api` prefix), with the stock cookie→bearer translation. This reads the **short-lived access cookie** (`__Host-cairn_access` in prod), _not_ the durable refresh-token cookie, and emits `Authorization: Bearer …` (exact `header_regexp` lands with Task 1.2's Caddyfile edit).
- **`/auth/*`** → an **explicit allow-list** → `reverse_proxy auth-proxy:3002`, with **no** prefix strip (the sidecar matches against `/auth/…`-shaped lists and strips `/auth` itself). The list covers the retained GoTrue magic-link endpoints (`/auth/magiclink* /auth/verify* /auth/token* /auth/user*`) **and** the Cairn-shaped BFF endpoints (`/auth/refresh* /auth/signout*`, plus `/auth/signin* /auth/register*` once 2003 lands); each endpoint's introducing task owns its own allow-list entry (exact regex set lands with those tasks' Caddyfile edits). A blanket `handle_path /auth/*` would break the SvelteKit client routes (`/auth/login|check|callback`) and the sidecar's narrowing — the subtlest prod-only failure. The dual-cookie plant + token-strip happens inside the `auth-proxy` BFF, not Caddy.
- **`/avatars/*.webp`** (GET) → `file_server` over the avatars volume with a one-year immutable `Cache-Control`; `POST/DELETE /avatars*` → `sidecar:3001` with the same cookie→bearer translation.
- **Everything else** (including `/gotrue/templates/*`) → `web:80`.

The behaviour is the contract: **the JavaScript in the browser never sees the JWT**, and PostgREST sees a normal `Authorization: Bearer …` header.

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
ln -s .env.prod .env   # migrate.sh sources .env, not .env.prod
./scripts/migrate.sh
```

Same script as in development, against the production Postgres. Two prerequisites the script assumes: it sources **`.env`** (not `.env.prod`) — so symlink `.env → .env.prod` on the box first — and it connects with the host's `psql` to `localhost:5432`, which is why the prod compose publishes Postgres on the loopback `127.0.0.1:5432` (the only published port besides Caddy's). Install `postgresql-client` on the box if `psql` isn't present, and on a cold box bump `MIGRATE_AUTH_USERS_TIMEOUT=120` for the first run. There is no production seed data — the database starts empty and the first user to sign up is genuinely the first user.

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

The repository password is encryption at rest. It is _not_ stored on the VPS. You hold this password; the Storage Box doesn't.

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

A release is: commit and push to `main`, SSH to the VPS, pull, migrate, rebuild, swap.

```bash
ssh cairn@<vps>
cd cairn
git pull
./scripts/migrate.sh       # if there are new migrations
./scripts/rebuild.sh       # rebuild the static bundle from the fresh checkout
./scripts/swap-image.sh    # bring the rebuilt image into service
```

The last two steps wrap the prod `docker compose … build web` / `up -d`
invocations so the long `-f … -f … --env-file .env.prod` incantation lives in
one place; both refuse to run unless `.env.prod` is present (their "you're on
the prod box" guard). They are deliberately separate commands — **`git pull`
alone changes only the source on disk; the live site keeps serving the old
bundle until `rebuild.sh` bakes a new one and `swap-image.sh` swaps it in.**
Forgetting the rebuild is the usual reason a freshly-merged screen or Settings
row "doesn't show up" after a deploy. See the header comments in
`scripts/rebuild.sh` and `scripts/swap-image.sh` for the full rationale.

`swap-image.sh` runs `docker compose up -d`, which only restarts containers whose configuration or image has changed, so this is fast — the database, auth, and API stay running while the web bundle swaps in.

The web bundle is built inside the `web` container (the Dockerfile runs `pnpm install && pnpm build`). This means a release is reproducible from the git checkout alone — no separate build pipeline, no artifact store, no host-side Node install. If `git pull` brings down web changes, the rebuild includes them; if it doesn't, the existing image is reused.

For Cairn at this stage, this is enough. If releases ever become frequent or risky enough that "SSH and pull" is a problem, GitHub Actions can do the same thing on every push to `main`.

## Service-worker considerations

A PWA with a service worker has one operational gotcha worth knowing about: **a service worker that has cached the previous version of the app shell will keep serving it until the new worker activates and the user reloads.** The user can be running yesterday's bundle for an extra session after a release.

Two countermeasures, both in the SvelteKit project:

- The build emits a content-hashed bundle. The service worker compares the hash against its cache and triggers an update when it changes.
- On detecting an update, the app shows a small _"A new version is available — refresh"_ affordance (non-modal, dismissable). It auto-applies on next launch regardless.

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

1. **GoTrue password grant must be unreachable for real accounts in prod.** The `/auth/token?grant_type=password` endpoint is server-side; whether the client bundle ships a helper for it is decorative — an attacker can hit it with `curl` either way. Verify in the GoTrue config that no real prod user can be password-signed-in. If a real admin account can, the bundle issue is the lesser problem and we have a separate vulnerability. _(This item changes when the username + password credential lands: the password grant becomes the real, intended sign-in path for prod accounts, so this check is reframed rather than dropped.)_

2. **`VITE_DEV_LOGIN_PASSWORD` must be unset when `pnpm build` runs for prod.** Vite inlines every `import.meta.env.VITE_*` reference at build time as a string literal — with no warning if a dev-only var leaks into the build environment. The structural fix above keeps `DevShortcuts.svelte` (and its env-var read) out of the prod graph, but if anyone ever adds another caller of `VITE_DEV_LOGIN_PASSWORD` outside the gated module, the value would re-leak. Grep `web/build/_app/immutable/` for the current dev password value before each prod release as a belt-and-braces watch.

3. **The revocable-session config must be in force.** GoTrue refresh-token rotation enabled with a reuse interval that safely covers multi-tab boot skew; `GOTRUE_JWT_EXP` lowered to the short access TTL (single-digit minutes); both session cookies `__Host-`-prefixed (forcing `Secure` + `Path=/` + no `Domain`); and the CSRF header enforced on the Cairn-shaped state-changing `/auth/*` endpoints. Confirm these before opening public traffic — a deploy with rotation off or the JWT TTL still long silently loses the revocability and reuse-detection guarantees.

## What's not here yet

Honest about the gaps:

- **No staging environment.** Dev → prod, no in-between. Defensible at this size; the cost of a staging VPS plus the maintenance burden isn't justified by Cairn's risk profile.
- **No automated rollback.** A bad release means manually `git checkout`ing the previous commit and running `up -d` again. Migrations are forward-only, which means a release that includes both a schema change and a bug requires more care.
- **No load shedding or rate limiting.** Caddy can do basic rate limiting via plugins; nothing is configured. If we ever get attention from the wrong people, this becomes urgent.
- **No SOPS-encrypted secrets in git.** Worth doing once there's more than one operator.

These are all "v2 when needed" items, not "v1 must-haves."
