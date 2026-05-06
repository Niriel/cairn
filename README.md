# Cairn

A SvelteKit Progressive Web App for collaborative ranked lists, backed by a
self-hosted Postgres + PostgREST + GoTrue stack (the Supabase open-source
components, run on our own Hetzner VPS rather than via Supabase's hosted
service).

This README is the **developer setup guide** — everything you need to install
on a fresh machine before you can build, test, and run Cairn. For day-to-day
workflow (migrations, seed data, debugging RLS, the dev-server proxy), see
[`docs/development.md`](docs/development.md). For *what Cairn is*, start with
[`docs/README.md`](docs/README.md).

> **Status:** The SvelteKit project and Docker Compose stack don't exist in
> this repo yet — only the spec and design canvas. The "First-time project
> setup" section below walks through generating the skeleton.

## What you're building

- **Web app** — SvelteKit (TypeScript), built with the static adapter and
  served as a Progressive Web App. Runs in any modern browser; installs to
  the home screen on phones.
- **Backend** — Postgres + PostgREST + GoTrue + Mailpit, all in Docker
  Compose locally; deployed to a Hetzner VPS in production. See
  `docs/architecture.md`.
- **Auth** — email magic links (real users) plus a dev shortcut (seed users).
  The JWT lives in an `HttpOnly` cookie set by Caddy on the way out; the web
  app never touches the token directly.

If SvelteKit is new to you: it's a small, compiler-first web framework built
around Svelte. You write components in `.svelte` files (HTML + a typed
`<script>` block + scoped CSS), the compiler turns them into vanilla JS, and
the dev server gives you near-instant hot-module replacement. File-system
routing means a route at `/lists/[id]` is a folder
`src/routes/lists/[id]/+page.svelte`. Less ceremony than Next.js, and the
output bundle is genuinely small.

## Prerequisites

Steps are written for Windows 11. macOS and Linux work the same way; install
via your usual package manager (Homebrew / apt) or the linked installers.

### 1. Git

Already installed (you cloned this repo). Otherwise: <https://git-scm.com/>.

### 2. Node.js (LTS) + pnpm

Install the current Node.js LTS via the official installer (Windows / macOS)
or your distro's Node packages (Linux):

<https://nodejs.org/>

Then enable pnpm. Modern Node.js ships [Corepack](https://nodejs.org/api/corepack.html),
which manages package-manager versions per project:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

This puts `pnpm` on your PATH without a separate global install. The repo's
`packageManager` field will pin a specific pnpm version once the SvelteKit
project exists.

### 3. Docker Desktop

The backend services run in containers, so you don't install Postgres etc.
directly.

<https://www.docker.com/products/docker-desktop/>

After installing and starting Docker Desktop:

```powershell
docker --version
docker compose version
```

You need Compose v2 (the `docker compose` subcommand, not the legacy
`docker-compose` binary).

### 4. VS Code extensions

If you're using VS Code (recommended for Svelte newcomers — best out-of-box
experience), install:

- **Svelte for VS Code** — `svelte.svelte-vscode`
- **ESLint** — `dbaeumer.vscode-eslint`
- **Prettier** — `esbenp.prettier-vscode`

These give you autocomplete, jump-to-definition, type errors inline,
on-save formatting, and lint feedback as you type.

## Verify your environment

```powershell
node --version
pnpm --version
docker compose version
```

All three should print versions without error. Node should be on the current
LTS; pnpm should be 8 or newer; Docker Compose should be v2.x.

## First-time project setup

The SvelteKit project doesn't exist in this repo yet. Generate it once:

```powershell
pnpm create svelte@latest web
```

Pick the **Skeleton project** template, **TypeScript** for type checking,
and add **ESLint** and **Prettier** when prompted. Then install dependencies:

```powershell
cd web
pnpm install
```

Switch the SvelteKit adapter to the static adapter (so we ship a folder of
files, not a Node server) — `docs/architecture.md` and
`docs/development.md` cover the configuration.

The Docker Compose stack and migration scripts described in
`docs/development.md` also need to be created — they are not yet present.

## Run the app

Start the backend:

```powershell
docker compose up -d
```

Start the SvelteKit dev server (from the `web/` directory):

```powershell
cd web
pnpm dev
```

The dev server runs on <http://localhost:5173> and proxies `/api` and
`/auth` to the backend containers, approximating the production cookie
shim (see `docs/development.md`). Save a `.svelte` file and the running
page hot-reloads in milliseconds without losing state.

To preview the production build (with the real service worker), run:

```powershell
pnpm build
pnpm preview
```

## Test

```powershell
cd web
pnpm test          # unit tests via Vitest
pnpm test:e2e      # end-to-end tests (needs the backend running)
```

Database tests (pgTAP, run via `pg_prove` against the Docker Postgres) are
described in `docs/development.md`.

## Where to next

- [`CLAUDE.md`](CLAUDE.md) — Cairn conventions for AI-assisted edits.
- [`docs/README.md`](docs/README.md) — full spec, with reading order.
- [`docs/development.md`](docs/development.md) — day-to-day dev workflow.
- [`docs/architecture.md`](docs/architecture.md) — runtime topology and why.
- `design/Cairn - Design Canvas.html` — open in a browser to see every screen.
