# Cairn

A SvelteKit Progressive Web App for collaborative ranked lists, backed by a
self-hosted Postgres + PostgREST + GoTrue stack (the Supabase open-source
components, run on our own Hetzner VPS rather than via Supabase's hosted
service).

This README is the **developer setup guide** — everything you need to install
on a fresh machine before you can build, test, and run Cairn. For day-to-day
workflow (migrations, seed data, debugging RLS, the dev-server proxy), see
[`docs/development.md`](docs/development.md). For _what Cairn is_, start with
[`docs/README.md`](docs/README.md).

> **Status:** The SvelteKit shell, Docker Compose stack, migration/seed
> scripts, and the lint/format/test toolchain are all in place. The
> three test layers carry only smoke tests so far — real RLS, unit,
> and end-to-end coverage lands with the features they exercise.

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

This puts `pnpm` on your PATH without a separate global install.

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

### 4. SQL, shell, and hook tooling

Cairn is polyglot — there's hand-written SQL in `db/` and shell scripts in
`scripts/` — and we lint and format both. Install these once on your
machine; the pre-commit hook expects them on `PATH`:

- **[SQLFluff](https://sqlfluff.com/)** — SQL linter and formatter, Postgres dialect.
  Python tool; install via `pipx install sqlfluff` (preferred) or `pip install --user sqlfluff`.
- **[ShellCheck](https://www.shellcheck.net/)** — shell-script linter. Single static binary;
  install via your package manager (`apt install shellcheck`, `brew install shellcheck`,
  `winget install koalaman.shellcheck`).
- **[shfmt](https://github.com/mvdan/sh)** — shell-script formatter. Single static binary;
  install via your package manager (`apt install shfmt`, `brew install shfmt`,
  `scoop install shfmt`).
  [lefthook](https://github.com/evilmartians/lefthook), the Git hook manager
  that runs the lint/format/check gauntlet on staged files, ships as a
  `web/` devDependency — `pnpm install` registers the hooks automatically
  (see `web/package.json` → `prepare`). No host install required.

The full toolchain — what each tool catches and how it's configured — is
documented in [`docs/quality.md`](docs/quality.md).

### 5. VS Code extensions

If you're using VS Code (recommended for Svelte newcomers — best out-of-box
experience), install:

- **Svelte for VS Code** — `svelte.svelte-vscode`
- **ESLint** — `dbaeumer.vscode-eslint`
- **Prettier** — `esbenp.prettier-vscode`
- **SQLFluff** — `dorzey.vscode-sqlfluff`
- **shell-format** — `foxundermoon.shell-format`

These give you autocomplete, jump-to-definition, type errors inline,
on-save formatting, and lint feedback as you type. The repo's
`.vscode/extensions.json` recommends them; opening the folder in VS
Code prompts you to install whichever you're missing.

## Verify your environment

```powershell
node --version
pnpm --version
docker compose version
```

All three should print versions without error. Node should be on the current
LTS; pnpm should be 8 or newer; Docker Compose should be v2.x.

## Install dependencies

```powershell
cd web
pnpm install
```

The SvelteKit project is already wired up with the static adapter and a
dev-server cookie shim that proxies `/api` to PostgREST and `/auth` to
GoTrue (see `web/vite.config.ts`). [`docs/architecture.md`](docs/architecture.md)
and [`docs/development.md`](docs/development.md) cover why.

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

To preview the production build, run:

```powershell
pnpm build
pnpm preview
```

## Test

The three test layers — pgTAP for database/RLS, Vitest for unit and
component, Playwright for end-to-end — are documented in
[`docs/testing.md`](docs/testing.md):

```powershell
./scripts/test-db.sh           # pgTAP — database / RLS tests
cd web
pnpm test                      # Vitest — unit and component tests
pnpm test:e2e                  # Playwright — end-to-end (needs the backend up)
```

Schema and RLS policies are the heart of Cairn's security model, so the
pgTAP suite is the load-bearing one.

Playwright also needs the browser binaries downloaded once per machine:

```powershell
cd web
pnpm exec playwright install --with-deps chromium firefox webkit
```

## Lint, format, type check

```powershell
cd web
pnpm check                     # type check (svelte-check)
pnpm lint                      # ESLint
pnpm format:check              # Prettier
sqlfluff lint ../db            # SQL lint
shellcheck ../scripts/*.sh     # shell lint
```

Or run the whole gauntlet — exactly what CI runs — in one shot:

```powershell
./scripts/check.sh
```

If you've installed the lefthook pre-commit hook (see prerequisites
above), the right subset of these runs on every commit automatically.
The full toolchain is documented in [`docs/quality.md`](docs/quality.md).

## Where to next

- [`CLAUDE.md`](CLAUDE.md) — Cairn conventions for AI-assisted edits.
- [`docs/README.md`](docs/README.md) — full spec, with reading order.
- [`docs/development.md`](docs/development.md) — day-to-day dev workflow.
- [`docs/architecture.md`](docs/architecture.md) — runtime topology and why.
- [`docs/testing.md`](docs/testing.md) — the three test layers (pgTAP, Vitest, Playwright).
- [`docs/quality.md`](docs/quality.md) — lint, format, type check, hooks.
- `design/Cairn - Design Canvas.html` — open in a browser to see every screen.
