# Cairn

A simple app for small groups to share lists of anything — movies to watch, books to read, places to try, gift ideas, things to do in town. The list itself is content-agnostic; it doesn't know or care what's on it.

## What it does

Alice loves old black-and-white films; Bob is a sci-fi nerd. They keep swapping recommendations and losing track in chat. With Cairn they share a list for Alice, a list for Bob, and a list for the two of them — and stop forgetting.

A list is a named collection of items. An item has a name, optional notes, timestamps, and per-member votes on a seven-step scale from −3 to +3. Lists default to sorting by score (the sum of all votes), with ties broken oldest-first. Anyone with access to a list can add, edit, soft-delete, or vote on items.

## What it values

- **Privacy.** No data passes through Google, Amazon, Microsoft, or any other hyperscaler. No third-party analytics or crash reporting by default. No push notifications — they would require a third-party push service we don't trust.
- **Low cost.** Under €15/month all-in for the entire backend, including backups.
- **Boring components.** Postgres, Docker, a reverse proxy. The interesting parts of Cairn should be the product, not the plumbing.
- **No app stores.** Cairn is a Progressive Web App: open it in a browser on any device, optionally install it to your home screen. No App Store review, no Play Store account, no $99/year. Friends get the app by visiting a URL.

## The stack, in one paragraph

A small Hetzner VPS in Germany runs PostgreSQL, [PostgREST](https://postgrest.org/) (which exposes the schema directly as a REST API), [GoTrue](https://github.com/supabase/gotrue) (email magic-link authentication), and [Caddy](https://caddyserver.com/) (reverse proxy with automatic TLS) — all as Docker containers. A fifth container serves the web app: a [SvelteKit](https://kit.svelte.dev/) bundle compiled to static files, runnable as a Progressive Web App on any modern browser. Backups go encrypted to a Hetzner Storage Box via [Restic](https://restic.net/).

For the reasoning behind each choice — and the alternatives we considered and rejected — see `architecture.md`.

## Running Cairn

Visit `cairn.<your-domain>` in any modern browser. On a phone:

- **Android (Chrome):** the browser shows an "Install app" banner the second time you visit. One tap and Cairn lives on your home screen like any other app.
- **iOS (Safari):** tap the share icon, then "Add to Home Screen." Same outcome — Cairn opens full-screen, with its own icon and splash screen, no browser chrome.
- **Desktop:** Cairn works in any browser; you can install it from the address bar in Chrome, Edge, or Brave if you want a dedicated window. Otherwise, leaving it as a pinned tab is fine.

The same code, the same data, every device.

## Documentation

- **`architecture.md`** — the technical architecture, why each component was chosen, the request flow, and what we considered and rejected.
- **`data-model.md`** — the database schema, the row-level security policies, and the views that shape the API.
- **`ui.md`** — user-interface conventions that affect more than one screen or have data-model implications.
- **`avatars.md`** — profile pictures: filesystem storage, the cache-busting `avatar_version` column, the upload sidecar, and the file lifecycle.
- **`account-deletion.md`** — how account deletion works: what's removed, what's anonymized, what stays, and the user-facing flow.
- **`data-export.md`** — the GDPR data-portability export: format (ZIP with JSON + HTML), scope, the `export_my_data` RPC, and the in-screen surfaces.
- **`invites.md`** — invitations, the three-way invite policy, and blocks. The full data flow for who can reach you and how.
- **`circles.md`** — what a circle is (and isn't). The single canonical reference for the circle model — read this first if you've never encountered it.
- **`development.md`** — how to set up and work on Cairn from a developer's laptop.
- **`testing.md`** — the three test layers (pgTAP, Vitest, Playwright), what each catches, and how to run them.
- **`quality.md`** — linting, formatting, type checking, and the pre-commit hook that runs them.
- **`deployment.md`** — how Cairn runs in production on a Hetzner VPS, including TLS, backups, and releases.
- **`logging.md`** — what each container logs, what's deliberately not logged, retention windows, and the operator's debugging workflow.
- **`open-questions.md`** — an index of currently-unresolved design decisions across the docs. Each bullet points at the doc section that holds the full context.

The docs are written to be read in roughly that order. `architecture.md` is the load-bearing one — the others build on its choices.

## Status

Pre-v1. The architecture and data model are designed; implementation is in progress. This README will be updated when there's something runnable.

## Name

A cairn is a small stack of stones that hikers leave on trails to mark the way for the people coming behind them. Friends leaving recommendations for each other has the same shape: *here's the way, you'll like this*.
