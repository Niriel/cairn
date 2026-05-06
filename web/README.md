# `web/` — Cairn's SvelteKit app

This is the frontend package. It is a SvelteKit project (TypeScript,
Svelte 5, Vite, the static adapter) that builds to a folder of HTML/JS/CSS
and ships as a Progressive Web App.

This README only documents what's specific to the `web/` package — pnpm
scripts, the relationship to the backend in dev, and where things live.
For everything broader, follow these pointers:

- **What Cairn is** → [`../docs/README.md`](../docs/README.md)
- **How the stack fits together** → [`../docs/architecture.md`](../docs/architecture.md)
- **Setting up a dev machine** → [`../README.md`](../README.md)
- **Day-to-day workflow** (migrations, seed, debugging RLS) → [`../docs/development.md`](../docs/development.md)
- **Tests** (Vitest, Playwright, pgTAP) → [`../docs/testing.md`](../docs/testing.md)
- **Lint / format / type check** → [`../docs/quality.md`](../docs/quality.md)

## Scripts

```bash
pnpm dev                   # dev server on :5173 with HMR and the cookie shim
pnpm build                 # static bundle into ./build (production)
pnpm preview               # serve ./build on :4173 (test the prod build locally)

pnpm check                 # type check (svelte-check)
pnpm check:watch           # type check, watch mode

pnpm lint                  # ESLint
pnpm lint:fix              # ESLint, auto-fix
pnpm format                # Prettier, write
pnpm format:check          # Prettier, check only

pnpm test                  # Vitest, one-shot
pnpm test:watch            # Vitest, watch mode
pnpm test:coverage         # Vitest with coverage report

pnpm test:e2e              # Playwright (needs the backend up — see ../docs/development.md)
pnpm test:e2e --ui         # Playwright UI mode
```

The `dev`, `build`, `preview`, and `check` scripts ship out of the box.
The `lint`, `format`, `test`, and `test:e2e` scripts are added as part
of wiring up the toolchain described in
[`../docs/quality.md`](../docs/quality.md) and
[`../docs/testing.md`](../docs/testing.md).

## Layout

```
web/
├── src/
│   ├── routes/           SvelteKit file-system routes
│   ├── lib/              shared modules (importable as $lib/…)
│   ├── service-worker.ts PWA service worker
│   └── app.html          HTML shell
├── static/               static assets served as-is (manifest, icons, …)
├── e2e/                  Playwright tests
├── svelte.config.js      adapter + alias config
├── vite.config.ts        dev server proxy + cookie shim
├── tsconfig.json         strict TS, extends the SvelteKit-generated config
├── eslint.config.js      flat-config ESLint (TS + Svelte + Prettier)
├── .prettierrc           Prettier config
└── vitest.config.ts      Vitest config (happy-dom, MSW handlers)
```

Tests are colocated with the code they test (`foo.test.ts` next to
`foo.ts`), except Playwright specs which live under `e2e/`. See
[`../docs/testing.md`](../docs/testing.md) for the rationale.

## The dev server is not standalone

`pnpm dev` runs only the frontend. The SvelteKit app talks to PostgREST
on `/api/*` and GoTrue on `/auth/*`, so it needs the backend Docker
Compose stack running too:

```bash
# from the repo root, in another terminal
docker compose up -d
./scripts/migrate.sh
./scripts/seed.sh         # optional — seeds Alice, Bob, Carol
```

The Vite dev server proxies `/api` and `/auth` to the local containers
and approximates Caddy's HttpOnly-cookie shim (see
`vite.config.ts`), so the app sees the same paths and cookie behaviour
in dev as it will in production.

## Environment

```bash
cp .env.example .env       # web-only env (Vite reads VITE_* vars)
```

The committed `.env.example` documents the variables the app reads at
build/dev time — `VITE_API_BASE`, `VITE_AUTH_BASE`, and the dev-only
login shortcut flag. The real `.env` is gitignored.

## Why Svelte (in two sentences)

Compiler-first, so the runtime is small and the bundle is mostly your
code rather than a framework. File-system routing and built-in stores
mean very little ceremony — a route at `/lists/[id]` is a folder
`src/routes/lists/[id]/+page.svelte` and that's the whole route. Full
reasoning is in [`../docs/architecture.md`](../docs/architecture.md).
