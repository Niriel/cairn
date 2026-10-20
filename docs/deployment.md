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

The split between dev and prod is structural rather than override-by-override: **`docker-compose.yml` is the prod-safe base** — it publishes _no_ ports and defines only the services common to both environments. The dev-only pieces (every published port, the `mailpit` service, the dev GoTrue env) live in **`docker-compose.override.yml`**, which Compose auto-loads for a bare `docker compose up` but which production never loads. **`docker-compose.prod.yml`** then adds only what production needs on top of the base. Both files are real and kept in sync by this plan — read them rather than a pseudocode copy here.

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
- **`GOTRUE_SITE_URL` is the web origin**, not the API — GoTrue's notion of where the app lives.
- **Mailpit is dev-only** — it lives in `docker-compose.override.yml` and is absent from the prod stack.
- **`GOTRUE_MAILER_AUTOCONFIRM: "true"`** stays on in production (not only in dev): the auth-proxy's `/auth/register` grant authenticates against the non-deliverable `<uid>@cairn.internal` identity, so signup must not block on an unclickable confirmation e-mail. E-mail verification instead happens optionally, later, when a user proves a recovery address (see `architecture.md` → "Password recovery is Cairn-orchestrated").

### The Caddyfile

The canonical production reverse-proxy config is the real `caddy/Caddyfile.prod` in the repo — read it rather than a pseudocode copy here. Its shape, single origin `cairn.{$DOMAIN}` with automatic Let's Encrypt TLS:

- `encode gzip` and the security headers (HSTS `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`).
- **`/api/*`** → `postgrest:3000` via `handle_path` (strips the `/api` prefix), with the stock cookie→bearer translation. This reads the **short-lived access cookie** (`__Host-cairn_access` in prod) via `header_regexp … Cookie __Host-cairn_access=…`, _not_ the durable refresh-token cookie, and emits `Authorization: Bearer …`.
- **`/auth/*`** → an **explicit allow-list** → `reverse_proxy auth-proxy:3002`, with **no** prefix strip (the sidecar matches against `/auth/…`-shaped lists and strips `/auth` itself). Two matchers: `@gotrue` covers the session endpoints the BFF forwards to GoTrue (`/auth/signout* /auth/refresh*`, all methods), and `@auth_credentials` covers the **POST-only** credential and recovery endpoints (`/auth/signin* /auth/register* /auth/recovery-email* /auth/forgot-password* /auth/reset-password*`). The POST gate is load-bearing: several of these are also SvelteKit page routes, so a **GET** to `/auth/signin` or `/auth/forgot-password` must fall through to `web` for the SPA to serve the screen. A blanket `handle_path /auth/*` would strip `/auth`, break the sidecar's segment matching, and swallow those GET pages — the subtlest prod-only failure. The dual-cookie plant + token-strip happens inside the `auth-proxy` BFF, not Caddy. Both `@auth`-handles also set **`header_up X-Real-IP {remote_host}`**: the BFF's sign-in rate-limiter keys per-IP off `X-Real-IP` only (never the spoofable `X-Forwarded-For`), Caddy doesn't set it by default, and Caddy overwrites any client-supplied value — so this both gives the limiter a true client IP and closes the spoof. Without it every client collapses into one shared per-IP bucket (Caddy's container address).
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
AUTH_BFF_DB_JWT=<scoped-role JWT, see below>
```

Generate the random values with `openssl rand -hex 32`. Store the file in your password manager — losing it means losing the database.

The same `SMTP_*` block now feeds the **auth-proxy** as well as GoTrue: the BFF sends Cairn's recovery and recovery-address-confirmation mail itself (GoTrue's built-in `/recover` can't reach the non-deliverable `<uid>@cairn.internal` identity — see `architecture.md` → "Password recovery is Cairn-orchestrated"), so the auth-proxy service in `docker-compose.prod.yml` receives `SMTP_HOST/PORT/USER/PASS/FROM` too.

`AUTH_BFF_DB_JWT` is the **scoped-role credential** the BFF uses for the signed-out reset flow: a long-lived JWT carrying `{"role":"cairn_auth_bff"}` signed with `JWT_SECRET` (the standard PostgREST service-role pattern, with a far-future `exp`). The two reset RPCs — the username→address lookup that mints a token, and the pgcrypto password-set — are granted **only** to `cairn_auth_bff`, never to `anon` or `authenticated`, so the BFF needs this JWT to call them. Mint it once with a small documented one-shot (a `scripts/mint-bff-jwt.sh` reading `JWT_SECRET`, not generated on every BFF boot) so it can be rotated independently. **This JWT is a high-value secret** — holding it is a reset-takeover primitive (its holder can mint and redeem a reset token without the emailed code) — so it is env-only, never logged, and rotatable. It is still preferred over a GoTrue admin/service-role key, which would grant strictly more.

## Initial migration

Once the stack is up:

```bash
cd /home/cairn/cairn
ln -s .env.prod .env   # migrate.sh sources .env, not .env.prod
./scripts/migrate.sh
```

Same script as in development, against the production Postgres. Two prerequisites the script assumes: it sources **`.env`** (not `.env.prod`) — so symlink `.env → .env.prod` on the box first — and it connects with the host's `psql` to `localhost:5432`, which is why the prod compose publishes Postgres on the loopback `127.0.0.1:5432` (the only published port besides Caddy's). Install `postgresql-client` on the box if `psql` isn't present, and on a cold box bump `MIGRATE_AUTH_USERS_TIMEOUT=120` for the first run. There is no production seed data — the database starts empty and the first user to sign up is genuinely the first user.

## Backups

> **Not yet in place.** Planned as master-plan step 21 (`plans/2100_backups/`); no off-site backups exist today, and the privacy policy says so (see `legal.md` → claims table). The design below is the plan, not a description of the live box.

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
./scripts/rebuild.sh       # rebuild ALL images from the fresh checkout
./scripts/swap-image.sh    # recreate ALL containers with the new images/config
```

The last two steps wrap the prod `docker compose … build` / `up -d
--force-recreate` invocations so the long `-f … -f … --env-file .env.prod`
incantation lives in one place; both refuse to run unless `.env.prod` is present
(their "you're on the prod box" guard). They are deliberately separate commands —
**`git pull` alone changes only the source on disk; the live site keeps serving
the old images until `rebuild.sh` bakes fresh ones and `swap-image.sh` swaps them
in.** Forgetting the rebuild is the usual reason a freshly-merged change "doesn't
show up" after a deploy. See the header comments in `scripts/rebuild.sh` and
`scripts/swap-image.sh` for the full rationale.

Both are **whole-stack by design**: `rebuild.sh` rebuilds every locally-built
image (postgres/pgTAP, sidecar, auth-proxy, web), and `swap-image.sh` runs
`docker compose up -d --force-recreate`, recreating **every** container — the
database included. That costs a few seconds of full-stack restart per release,
deliberately traded for never shipping a half-updated stack: Compose does not
notice an edit behind a bind mount (the Caddyfile is the classic trap — same
mount, changed contents, looks unchanged to `up -d`), so a targeted swap can
silently leave Caddy on the old config or a service on a stale image. Rebuilding
and recreating everything removes the "which container didn't pick up the change?"
failure mode entirely.

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

Several things must be confirmed before opening Cairn to public traffic:

1. **The public GoTrue password grant must reach GoTrue only through the BFF.** The password grant is the sign-in path, and exactly one route reaches it: the auth-proxy (and its dev mirror in `web/vite.config.ts`) rejects a direct `POST /auth/token?grant_type=password` with `403 { error: 'use /auth/signin' }` and never forwards it, so `POST /auth/signin` — behind the CSRF gate and the per-IP / per-account rate limiter — is the only way in. Verify that GoTrue is **not** reachable from the public internet except via Caddy → the BFF — a caller who can hit GoTrue's `:9999` directly bypasses both the lockdown and the rate limiter. (The Caddy `@gotrue` allow-list and the internal-only GoTrue port are the structural guarantee; this checklist item is the pre-deploy confirmation of it.)

2. **The revocable-session config must be in force.** GoTrue refresh-token rotation enabled with a reuse interval that safely covers multi-tab boot skew; `GOTRUE_JWT_EXP` lowered to the short access TTL (single-digit minutes); both session cookies `__Host-`-prefixed (forcing `Secure` + `Path=/` + no `Domain`); the CSRF header enforced on the Cairn-shaped state-changing `/auth/*` endpoints; and Caddy setting `X-Real-IP` on the auth-proxy upstreams (both `@gotrue` and `@auth_credentials`) so the sign-in rate-limiter's per-IP key is the real client, not Caddy's container. Confirm these before opening public traffic — a deploy with rotation off or the JWT TTL still long silently loses the revocability and reuse-detection guarantees.

3. **The signup switch lives in the prod `.env`; its compose default is restrictive.** `docker-compose.prod.yml` sets `GOTRUE_DISABLE_SIGNUP: "${DISABLE_SIGNUP:-true}"` — registration is **operator-controlled and closed by default** unless the prod `.env` sets `DISABLE_SIGNUP=false`. Whichever way it is set, **the password grant does not depend on it**: sign-in and the self-serve password reset both work whether or not new registration is open. The per-IP register throttle bounds mass signup from one source. `docs/invites.md` governs invite _acceptance_, not signup-openness.

4. **The recovery flow's SMTP env and scoped-role credential must reach the auth-proxy.** Password recovery is Cairn-orchestrated (see `architecture.md`), so the **auth-proxy** — not just GoTrue — needs `SMTP_HOST/PORT/USER/PASS/FROM` in its service env, plus `AUTH_BFF_DB_JWT` (the `cairn_auth_bff` scoped-role JWT signed with `JWT_SECRET`; see `.env.prod` above). Confirm: (a) both are present in the prod `.env` and wired to the `auth-proxy` service in `docker-compose.prod.yml`; (b) Caddy's `@auth_credentials` allow-list routes the four recovery POST endpoints (`/auth/recovery-email*`, `/auth/recovery-email/confirm*`, `/auth/forgot-password*`, `/auth/reset-password*`) to the BFF, while the page GETs for `/auth/forgot-password` and `/auth/reset-password` still fall through to the SPA; (c) `AUTH_BFF_DB_JWT` is treated as a high-value secret (env-only, never logged, rotatable — it is a reset-takeover primitive). Without (a) the recovery endpoints reach the scoped RPCs as `anon` and fail; without (b) they 404 in prod while passing every unit test on stubs.

### Forced re-auth on the revocable-session deploy

Deploying the revocable session **signs every existing user out once**, by design — they land on the sign-in screen on their next visit and re-authenticate with their username and password. No session purge, cache flush, or operator action is needed; the sign-out is structural:

- The durable cookie is **renamed** under the `__Host-` prefix (`cairn_session` → `__Host-cairn_session`), so a browser still holding the old pre-deploy `cairn_session` cookie sends a name the new BFF and Caddy don't read.
- Even if the old cookie's name matched, its contents are now wrong: the pre-2002 `cairn_session` held an **access JWT**, whereas the new durable cookie holds a **refresh token**. Boot does refresh-then-check (`POST /auth/refresh`), so an old artefact is offered to GoTrue's refresh-token exchange, rejected, and the client falls to signed-out.
- The data plane reads the separate short-lived `__Host-cairn_access` cookie, which no pre-deploy client has at all → `/api` runs as `anon` until re-auth.

This is the intended close of the non-revocable-session gap: the old long-lived bearer can no longer authenticate anything. The alpha is small, so no scheduled-maintenance banner is warranted — but if a one-time "please sign in again" notice is ever wanted, this deploy is the moment for it.

### Applying the alpha identity migration

Migration `0023_alpha_migration.sql` moves the live-alpha accounts onto the stable-identity model in place: for each eligible account it grandfathers the current e-mail into `user_settings.recovery_email`, derives a memorable username from the display name, and sets `auth.users.email` to the non-deliverable `<uid>@cairn.internal` identity. It is idempotent — an account already on `@cairn.internal` is skipped — and a no-op on a fresh database, where the only pre-existing row is the tombstone.

The operator steps, once the release is deployed:

1. Apply the migration with `./scripts/migrate.sh`; it ends by calling `backfill_legacy_identity()`, which returns the number of accounts migrated.
2. Tell each migrated user their **derived username** (read from `profiles.username`), out of band.
3. Each user sets a password by driving **forgot-password**: they enter their username, receive a reset code at their grandfathered recovery address, and complete the reset — then sign in. These accounts hold no password until this step, so it is mandatory, not optional.

The migrated users need no separate forced sign-out: this release rides on the revocable-session deploy above, whose cookie rename signs every existing session out once. That single re-auth is the moment they set a password.

**Post-deploy smoke step.** After applying `0023`, confirm one migrated account completes the whole path end to end — **forgot-password → `reset_password` → sign-in**. This is the only end-to-end check of the in-place identity rewrite: the pgTAP suite proves the SQL transform, but the e2e suite exercises only fresh accounts, so the migrated-account path is otherwise unverified by an automated layer.

## What's not here yet

Honest about the gaps:

- **No staging environment.** Dev → prod, no in-between. Defensible at this size; the cost of a staging VPS plus the maintenance burden isn't justified by Cairn's risk profile.
- **No automated rollback.** A bad release means manually `git checkout`ing the previous commit and running `up -d` again. Migrations are forward-only, which means a release that includes both a schema change and a bug requires more care.
- **No load shedding or rate limiting.** Caddy can do basic rate limiting via plugins; nothing is configured. If we ever get attention from the wrong people, this becomes urgent.
- **No SOPS-encrypted secrets in git.** Worth doing once there's more than one operator.

These are all "v2 when needed" items, not "v1 must-haves."
