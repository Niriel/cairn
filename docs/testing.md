# Testing

Cairn tests in four layers, each catching a different class of bug. This document is the canonical reference for what each layer is for, where the tests live, how to run them, and — just as important — what _not_ to put in each layer. `development.md` covers the dev stack itself; this doc assumes that stack is up and running.

The guiding principle: **the database is the security boundary**, so the database tests are the load-bearing layer. Vitest and Playwright are excellent and we want both, but if forced to choose one suite to keep, it would be the pgTAP suite. Authorization lives in row-level security; if RLS is wrong, every other layer is a Maginot Line.

## The four layers

| Layer            | Tool                                                                                                                        | What it catches                                                                                                                 | Speed                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Database         | [pgTAP](https://pgtap.org/) + `pg_prove`                                                                                    | RLS policies, triggers, views, constraints                                                                                      | Sub-second per test, ~1s startup |
| Unit / component | [Vitest](https://vitest.dev/) + [`@testing-library/svelte`](https://testing-library.com/docs/svelte-testing-library/intro/) | Pure-function logic in `src/lib/`, component rendering and interaction                                                          | Milliseconds                     |
| Sidecar          | [Vitest](https://vitest.dev/) + [supertest](https://github.com/ladjs/supertest)                                             | Avatar upload/delete routes: security gates (magic bytes, decoded bounds, size limit), auth middleware, success and error paths | Milliseconds                     |
| End-to-end       | [Playwright](https://playwright.dev/)                                                                                       | Real user flows across the full stack (browser → Caddy/Vite → PostgREST → Postgres)                                             | Seconds per test                 |

The numbers in the [test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) sense: many pgTAP tests, many Vitest tests, a handful of Playwright tests. We do not aim for "100% coverage" of any layer — we aim for the _right_ tests in each, with deliberate redundancy where the cost of a regression is highest (auth, votes, soft-delete recovery).

## Database tests (pgTAP)

`db/tests/*.sql` holds pgTAP tests. They run against a _throwaway test database_ — never against the dev database — that is created fresh from the migration files for each run. This is non-negotiable: a test that mutates the dev database is a footgun, and a test that depends on dev seed data is brittle.

### What lives here

- **RLS policies.** For every policy on every table, a positive test ("Alice sees her own list") and a negative test ("Alice does not see Bob's private list"). When a verb is denied by _both_ the absence of a `GRANT` _and_ the absence of a permissive policy (e.g., `INSERT` on `public.lists`, where creation goes through an RPC instead), test the two layers as **separate assertions** — one `throws_ok` on SQLSTATE `42501` under the role with no grant, and one assertion under a grant-bearing role exercising the missing policy. Conflating them into a single check hides regressions: `GRANT` without a policy returns silent empty results, a policy without `GRANT` returns 401/`42501`, and only the layered tests catch a future change that drops one layer while leaving the other in place.
- **Triggers.** Soft-delete cascades, `updated_at` bumps, audit/attribution rows.
- **Views.** The shape and filtering of every view exposed via PostgREST.
- **Constraints and check expressions.** Anywhere we encode an invariant in the schema, a test verifies it actually rejects what it claims to reject.
- **Stored functions and RPC.** Any function callable via PostgREST.

What does _not_ belong here: tests of application behaviour that just happen to touch the database. Those go in Vitest (mocked) or Playwright (real). pgTAP tests should be expressible purely in SQL.

### Setup

pgTAP is a Postgres extension plus a Perl test harness (`pg_prove`). The dev `postgres` image doesn't include either. We add both via a small derived image — `db/Dockerfile` — built once and used by both the dev and test compose profiles:

```dockerfile
FROM postgres:16
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-16-pgtap \
      perl \
      libtap-parser-sourcehandler-pgtap-perl \
 && rm -rf /var/lib/apt/lists/*
```

`docker-compose.yml` builds from this Dockerfile instead of pulling `postgres:16` directly. The image is bit-identical between dev and CI; the extension is only loaded into the _test_ database, so the dev database never sees it.

### Running tests

```bash
./scripts/test-db.sh
```

This script:

1. Drops and recreates a `cairn_test` database (separate from `cairn`).
2. Applies every migration in order against `cairn_test`.
3. Runs `CREATE EXTENSION pgtap` in `cairn_test`.
4. Loads a _test fixture_ (a smaller, deterministic seed than `dev_seed.sql` — see below).
5. Invokes `pg_prove --ext .sql db/tests/` from inside the postgres container.

The whole run takes a couple of seconds on a laptop. Run it on every schema change. If you change a policy, run it twice — once before to confirm the existing tests pass, once after to confirm the new behaviour is asserted.

### Test fixtures vs. dev seed

`db/seed/dev_seed.sql` is for hand-clicking the app with familiar names. `db/tests/fixtures/*.sql` is for assertions. They are separate files for separate purposes:

- The dev seed can change freely as we explore UX. Tests that depended on it would break every time.
- Test fixtures are minimal and obvious: `user_a`, `user_b`, `list_owned_by_a`, `private_list_of_b`. They exist to make assertions readable.

Each test file loads only the fixtures it needs, inside a `BEGIN ... ROLLBACK` so tests don't leak into each other.

### Writing a test

```sql
-- db/tests/rls_lists_visibility.sql
BEGIN;
SELECT plan(2);

-- Fixture: Alice is a member of the shared list (id 11111111-...);
-- Bob is too; Carol is not.
\i /db/tests/fixtures/list_shared_alice_bob.sql

-- As Alice, the shared list is visible.
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM lists
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  1,
  'Alice sees the shared list (her own membership)'
);

-- As Carol (non-member), the shared list is invisible.
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
SELECT is(
  (SELECT count(*)::int FROM lists
    WHERE id = '11111111-1111-1111-1111-111111111111'),
  0,
  'Carol does not see the shared list (no membership)'
);

SELECT finish();
ROLLBACK;
```

Three conventions to notice:

- **Every test wraps in `BEGIN ... ROLLBACK`.** No test mutates state another test will see; fixtures load fresh inside each transaction.
- **Every assertion has a human-readable message.** That's what shows up in `pg_prove` output when something fails at 2 a.m.; future-you will thank present-you for spelling out _what_ the assertion meant.
- **Fixture `\i` paths are absolute** — `/db/tests/fixtures/<name>.sql`, not `fixtures/<name>.sql`. `pg_prove` runs inside the postgres container with WORKDIR `/`, not `/db/tests`, so a relative path resolves to `/fixtures/...` and the include fails. The absolute path matches the read-only volume mount in `docker-compose.yml` (`./db:/db`) and is robust regardless of invocation cwd.

The JWT-claim form is also worth noting: `SET LOCAL request.jwt.claims = '{"sub":"<uuid>"}'` — the JSON-object GUC PostgREST v10+ sets per request. The old per-claim form `request.jwt.claim.sub` was removed in PostgREST v10; we run v12, so the JSON form is what `public.uid()` reads from. `SET LOCAL` scopes the GUC to the current transaction, so the surrounding `BEGIN ... ROLLBACK` resets it automatically; subsequent `SET LOCAL` calls within the same transaction overwrite it (e.g., when a test switches from "act as Alice" to "act as Carol" mid-file, as above).

## Unit and component tests (Vitest)

Vitest runs from the `web/` directory. It tests two kinds of thing:

- **Pure logic in `src/lib/`** — sorting (votes-then-age), text helpers, date formatting, the client-side bits of soft-delete, anything testable without a DOM.
- **Svelte components** — rendering, props, events, accessibility roles. Mounted via `@testing-library/svelte`, asserted with `@testing-library/jest-dom` matchers, run inside `happy-dom` (faster than jsdom and sufficient for our needs).

### Layout

```
web/
├── src/
│   ├── lib/
│   │   ├── sort.ts
│   │   └── sort.test.ts        ← colocated unit tests
│   └── routes/
│       └── lists/
│           └── ListItem.test.ts ← component test next to the component
└── vitest.config.ts
```

Tests are colocated with the code they test (`foo.test.ts` next to `foo.ts`). This keeps the tree easy to navigate and removes the temptation to test private internals from outside — if you want to test something, it has to be exported.

### What component tests are for

Component tests assert _behaviour visible to a user_, not implementation details:

- "When the up-vote button is clicked, the `vote` event is dispatched with the right payload."
- "When `list.deletedAt` is set, the item shows the _Restore_ button instead of _Delete_."
- "The list header has `role='heading'` and `aria-level='1'`."

They are not for asserting that a particular CSS class is present, or that a child component received a particular prop. Those tests break on every refactor and verify nothing a user cares about.

#### Don't assert on UI label text

A test that says `expect(container.textContent).toContain('Delete list')` against a row whose label is literally the string `Delete list` is tautological — it copies the source into the test and checks the copy matches. It also locks the test to the current language, so the day we add internationalisation, every such assertion breaks for reasons that have nothing to do with the behaviour under test.

Assert via `data-test` attributes (or roles, ARIA labels, structural relationships) instead:

```ts
// ❌ tautological + i18n-fragile
expect(container.textContent).toContain("Delete list");

// ✅ checks the row is present, regardless of its label string
expect(getByDataTest("list-overflow-delete")).not.toBeNull();
```

The exception is _data_ that flows in as a prop or from a fixture (a list name, a user's display name, a timestamp) — that's not a UI label, it's the variable content the component is rendering, and asserting on it is a real check that the data reached the DOM.

### Mocking the API

Component tests use [MSW](https://mswjs.io/) (Mock Service Worker) to intercept `fetch` and return canned PostgREST responses. The mocks live in `web/src/lib/test/handlers.ts` and are imported by `vitest.setup.ts`. Each test can override individual handlers for the scenario it cares about.

We deliberately mock at the network layer rather than at a "fake API client" abstraction. This means:

- We can refactor the API client without rewriting every test.
- The mock responses are real JSON that PostgREST could plausibly return, which catches off-by-one shape errors that a hand-rolled mock would miss.

### Running

```bash
cd web
pnpm test               # one-shot run
pnpm test:watch         # watch mode (the usual local loop)
pnpm test:coverage      # with v8 coverage; opens HTML report in coverage/
```

Vitest's watch mode re-runs only the affected tests in a fraction of a second. Leave it running in a split terminal while you work.

### Where tests live and how they're written

The tree shape — which folder a component, runes module, helper, mock, or test belongs in, and what each file is named — is the subject of `docs/frontend-layout.md`. The per-test conventions — `data-test` queries via `web/src/lib/test/render.ts`, the hybrid `__mocks__/` convention, the Svelte 5 runes idiom in mock files, the no-shared-`beforeEach` rule, MSW at the network layer — are the subject of `.claude/skills/writing-tests.md`, which fires whenever a session is editing a `*.test.ts` file. This doc is the _what_ and _why_ of the Vitest layer; the layout doc is the _where_, and the skill is the _how_.

## End-to-end tests (Playwright)

Playwright drives a real browser against the _fully running_ stack — `pnpm dev` (or the production preview build) plus the dockerized backend with seeded data. It catches the bugs that neither pgTAP nor Vitest can: cookie shim regressions, service-worker caching mishaps, real-network race conditions, the gap between what the API returns and what the UI renders.

### What lives here

A small, deliberate set of _user journeys_, not a re-creation of the unit suite:

- **Auth happy path.** Magic-link login (Mailpit-driven), cookie set, redirected into the app, logged out.
- **List lifecycle.** Create a list, add items, vote, soft-delete, restore from trash.
- **Sharing.** Invite by handle, the recipient sees the invite, accepts, both see the list.
- **Offline read.** Open a list online, go offline, reload, see cached items.
- **PWA install path.** Manifest is served, service worker registers, app shell loads on reload-while-offline.

Five to ten journeys total. Each one is the kind of thing a developer would manually click through before shipping; Playwright does it for them, in three browsers, deterministically.

### Layout

```
web/
└── e2e/
    ├── auth.spec.ts
    ├── list-lifecycle.spec.ts
    ├── sharing.spec.ts
    └── playwright.config.ts
```

Tests live under `web/e2e/`, separate from the colocated unit tests under `src/`. The two suites have different lifecycles (Vitest watches files; Playwright spawns browsers) and the separation keeps Vitest from picking up `.spec.ts` files it doesn't know how to run.

### Browsers

Chromium, Firefox, and WebKit. WebKit matters because iOS Safari is our most-constrained target — bugs that only show up there (storage eviction, cookie attributes, service-worker quirks) surface here first.

### State management

Each E2E test starts from a known database state. The `playwright.config.ts` `globalSetup` script:

1. Waits for the backend to be healthy (`scripts/smoke.sh`).
2. Resets the database (`docker compose down -v && up -d && migrate && seed`).

Individual tests do not reset between cases — that would be too slow. Instead, each test creates its own data with unique names (`list_${testId}`) so tests don't collide. If a test needs a clean slate, it runs in its own `test.describe.serial` block with a `beforeAll` hook.

### Running

```bash
cd web
pnpm test:e2e                       # headless, all browsers
pnpm test:e2e --ui                  # Playwright UI mode (the right loop locally)
pnpm test:e2e --project=chromium    # one browser
pnpm test:e2e auth                  # only auth.spec.ts
```

Playwright UI mode is the dramatically nicer way to write and debug these — it shows a timeline, lets you step through, and surfaces the network and DOM at every point. Use it.

### Speed budget

The whole E2E suite should finish in under a minute on a laptop. If it grows beyond that, the temptation is to convert flaky journey tests into a swarm of small ones — resist. The right move is to delete tests that aren't earning their keep, not to optimize the runtime of duplicate coverage.

## What we don't test

- **Third-party libraries.** SvelteKit's router works; we don't have a test for that.
- **PostgREST itself.** It is not under test in our suite. We test our schema and policies; PostgREST is configured, not coded.
- **The Caddy cookie shim, in unit tests.** The shim is two lines of Caddyfile config; it is exercised end-to-end by the auth Playwright test, and that's the right place.
- **Type signatures.** The type checker (`pnpm check`) is the test for those; see `quality.md`.

If you find yourself writing a test whose only assertion is "this code path is reachable," delete it.

## Coverage

We do not enforce a coverage percentage in CI. The metric is too easy to game (assert nothing, but call everything) and produces tests that exist for the metric's sake.

What we do enforce, by review:

- Every RLS policy has at least one positive _and_ one negative pgTAP test.
- Every public function in `src/lib/` has Vitest coverage of its happy path and the obvious edge cases.
- Every user-visible feature listed in `docs/ui.md` has at least one Playwright touch.

`pnpm test:coverage` produces an HTML report under `web/coverage/` if you want to see what's actually exercised. Useful as a _map_, not a target.

## CI

The CI pipeline (when wired up) does what a developer does locally, in this order:

1. `docker compose up -d` (backend services).
2. `./scripts/migrate.sh` then `./scripts/seed.sh`.
3. `./scripts/test-db.sh` — pgTAP suite.
4. `cd web && pnpm install --frozen-lockfile`.
5. `pnpm check` — type check (see `quality.md`).
6. `pnpm lint` — lint (see `quality.md`).
7. `pnpm test` — Vitest.
8. `pnpm build` — verify the production bundle compiles.
9. `pnpm test:e2e` — Playwright against the running stack.
10. `docker compose down -v` — clean up.

The choice of CI host is deliberately not prescribed here: any runner that can run Docker and Node works. The pipeline is just a shell script someone else's CI invokes.

## Common failure modes

**A pgTAP test passes locally and fails in CI.** Almost always a fixture-ordering issue (one test's data leaking into the next). Confirm every test is wrapped in `BEGIN ... ROLLBACK` and that fixtures use stable literal UUIDs, never `gen_random_uuid()`. Cairn's convention by table: users `aaaa…`/`bbbb…`/`cccc…` (Alice/Bob/Carol), lists `1111…`/`2222…` (shared/solo), items `3333…`/`4444…`/… as needed in per-test setup. List fixtures override `lists.id default gen_random_uuid()` by passing `id` explicitly in the INSERT — safe because the fixture runs as the test session's `cairn` superuser.

**A Vitest component test passes locally and fails in CI.** Time-of-day or locale dependency. Pin `Intl` formatters and avoid `new Date()` without a fixed argument.

**A Playwright test is flaky.** Almost always one of: (a) waiting for a network response that may have already arrived (use `page.waitForResponse` carefully, or `expect(...).toHaveText` with auto-retry); (b) a real timing bug worth investigating (don't paper over it with `await page.waitForTimeout`).

**WebKit fails to launch (`Host system is missing dependencies`).** Environmental, not a test bug — the WebKit build needs system libraries that this dev box doesn't have, and installing them isn't worth it. Accept it: run `--project=chromium --project=firefox` and say so explicitly — don't report a WebKit pass you didn't get. Chromium + Firefox still validate the journeys; only the iOS-Safari-specific quirks (see "Browsers") go unchecked.

**The clipboard "Copied" assertion (`public-list.spec.ts`) fails headlessly.** Copy-to-clipboard relies on `navigator.clipboard`, which needs a permitted, focused, secure-context browser; some headless/sandboxed environments deny it, so the "Copied" feedback never appears. This is environment-dependent, not an app regression — confirm it passes in `--ui` mode or a real browser before treating it as a real failure. (It also can't be run in isolation with `--grep`: it lives in a `test.describe.serial` block and depends on the preceding "publish" test having opened the overflow menu, so grepping just it yields a "context closed" error.)

**The whole suite is fast locally and slow in CI.** Disk I/O on the runner, usually. Use a tmpfs Postgres data volume in CI.

**`fk_ok()` gives a false result when a column has multiple foreign keys.** pgTAP 1.3's `fk_ok()` looks up FKs by source column only — no filter on the referenced table — so when two constraints exist on the same column (e.g. one to `auth.users` and one to `public.profiles`) it picks one row from `pg_all_foreign_keys` arbitrarily, and the assertion becomes a coin flip. Cairn has several columns in this shape: `items.created_by`, `items.modified_by`, and `votes.user_id` each carry both an `auth.users` FK (for cascade behaviour) and a `public.profiles` FK (for PostgREST embedded joins). **Do not use `fk_ok()` for those columns.** Instead, query `pg_constraint` by constraint name:

```sql
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE c.conname = 'my_constraint_name'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'my_table.my_col FK to profiles'
);
```

The pattern is safe for any column with a single FK too — prefer it whenever you know the constraint name.
