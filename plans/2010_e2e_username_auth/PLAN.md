# Plan: repair the e2e suite for username auth

Migrate the Playwright specs that still log in via the retired magic-link flow
onto the shipped username + password auth, and fix one blocked-invite spec that
captured the wrong list, so `pnpm test:e2e` is green again on chromium + firefox
and the `2005` merge is unblocked.

## Context

Step 2003 (`plans/2003_username_auth/`) made username + password the real
sign-in path. A signed-out visit to `/` now redirects to `/auth/signin`; the
magic-link screen still exists at `/auth/login` but is a separate flow. That
broke every e2e spec whose `beforeAll` logged in the old way —
`goto('/')` → `await expect(page).toHaveURL(/\/auth\/login$/)` →
`fill('[data-test="login-email"]')` → `waitForMagicLink(email)`. The failures
sat unnoticed for weeks because the maintainer was working from a laptop that
can't run Playwright at all, so they accumulated silently.

They surfaced when the full suite was finally run during `2005_add_by_username`
task 4.1: **16 failures across 8 specs**, in two buckets. Seven specs
(`avatar`, `delete-account`, `export`, `items`, `public-list`, `welcome`,
`imprint`) still drive the magic-link login. The eighth, `block.spec.ts` (b), is
a spec that _was_ migrated onto username auth in the `2005` task 2.1 follow-up
but had never actually been executed — running it revealed a latent bug in how
it captures the target list id.

The username-auth test infrastructure the fix needs already exists on this
branch's base (`2005`): `web/e2e/helpers/auth.ts` exports `register`,
`signInWithPassword`, and `uniqueUsername`, and the `invites` / `privacy` /
`block` specs already use them (see those specs for the idiom). This plan is
purely test maintenance — the product already works via username auth; the specs
just have to talk to it correctly.

This is **not** the prod-facing `2006` step (backfill usernames, initial-password
path, remove the magic-link surface). We only stop the specs from _using_
magic-link for login; the login surface is untouched.

## Decisions

**Migrate via `register()`, not `signInWithPassword()`.** Every affected spec
wants a fresh, isolated user per run (they currently mint a unique
`alice+<runId>@example.test` for exactly this reason). `register(page,
uniqueUsername(prefix), PASSWORD)` creates such an account and lands signed-in on
`/lists` in one call — the direct replacement for the whole magic-link preamble.
`signInWithPassword` is for re-signing an _existing_ account and isn't needed by
any spec here.

**Keep each spec's behaviour identical; change only the sign-in preamble.** The
value of these specs is their post-login coverage (avatar upload, export ZIP,
publish flow, …). The migration is a mechanical swap of the `beforeAll` login
block plus removal of the now-unused `./helpers/mailpit` import. Two specs need
one extra edit each: `delete-account` asserts the post-deletion return route
(was `/auth/login`), and `imprint` follows the footer link from the new pre-auth
landing (`signin-imprint-link` on `/auth/signin`, not `login-imprint-link`).

**`welcome` still asserts the banner.** `WelcomeBanner.svelte` renders when
`profile.displayName === 'New user'`, and the signup trigger
(`db/migrations/0019_username_identity.sql:63`) sets exactly that default for
every new account — so a `register()`ed user still sees it (R3). No rework
beyond the sign-in swap.

**`block.spec.ts` (b): deterministic list capture, after diagnosis.** The spec
fails with the toast "They're already on this list." instead of the expected
"Couldn't send invite." The likely cause: its `bobListId` capture,
`bob.locator('[data-test^="list-nav-"]').first()`, resolves to the _shared_ list
(which Alice created, so she is a member) rather than Bob's own list — so the
invite hits the already-a-member branch, not the block branch. The fix is to
capture the id deterministically: filter the nav locator by the just-created
list's name, or navigate into the list and read `page.url()` (the idiom
`public-list.spec.ts` already uses). Diagnose first to confirm this is a spec
capture bug; if the wrong toast turns out to be a genuine product bug in
`send_invitation`'s membership-vs-block ordering, stop and escalate — a product
fix + pgTAP is out of scope for a test-repair plan (R6).

**Leave `auth.spec.ts`, `password-recovery.spec.ts`, and the mailpit helper
alone.** Those two specs legitimately test the magic-link and recovery-mail flows
and pass; the mailpit helper is their tool. Touching them would be scope creep.

**WebKit stays unrun.** This Fedora box lacks the system libraries WebKit needs
(`docs/testing.md`; the standing machine rule). All runs pass
`--project=chromium --project=firefox`; the config's `webkit` project is simply
not invoked locally. Not a regression this plan introduces.

## Architecture

No new files. No product-code changes. All edits are to existing Playwright
specs; `web/e2e/helpers/auth.ts` already provides what they need.

### Modified files

- **`web/e2e/avatar.spec.ts`** — replace magic-link `beforeAll` with
  `register()`; drop the `mailpit` import.
- **`web/e2e/export.spec.ts`** — same swap.
- **`web/e2e/items.spec.ts`** — same swap; the create-list/add-items/vote setup
  after login is unchanged.
- **`web/e2e/public-list.spec.ts`** — same swap; the anon-context steps need no
  auth.
- **`web/e2e/welcome.spec.ts`** — same swap; still asserts the welcome banner.
- **`web/e2e/delete-account.spec.ts`** — same swap **plus** fix the
  post-deletion "Back to sign in" route assertion to the real route.
- **`web/e2e/imprint.spec.ts`** — navigate to the current pre-auth landing and
  follow `signin-imprint-link`; no auth.
- **`web/e2e/block.spec.ts`** — deterministic `bobListId` capture so step (b)
  targets a list Alice is not on.

### Unchanged (referenced, not edited)

- **`web/e2e/helpers/auth.ts`** — `register` / `signInWithPassword` /
  `uniqueUsername`; the migration target.
- **`web/e2e/helpers/mailpit.ts`** — stays for `auth` / `password-recovery`.

## Phase structure

TDD note: these _are_ tests. There is no product code to write red-first — the
app already behaves correctly under username auth. Each task's loop is: confirm
the spec is red now (the documented pre-existing failure), edit the spec, then
confirm it is green on chromium + firefox. The "red before green" invariant holds
in the sense that we observe the failure before editing.

1. **Phase 1 — migrate the magic-link specs (Tasks 1.1–1.3).** 1.1 swaps the
   five straight-swap specs (`avatar`, `export`, `items`, `public-list`,
   `welcome`) onto `register()`. 1.2 migrates `delete-account`, including the
   post-deletion route fix (R5). 1.3 migrates `imprint` to the new pre-auth
   landing and footer link (R4). Satisfies R1–R5.
2. **Phase 2 — fix the blocked-invite capture (Task 2.1).** Diagnose and fix
   `block.spec.ts` (b)'s list-id capture so it asserts the block outcome (R6).
3. **Phase 3 — full-suite green gate (Task 3.1).** Run the entire suite on
   chromium + firefox and `./scripts/check.sh`; confirm R7. This is the
   merge-readiness checkpoint that unblocks the `2005` merge (its task 5.1 needs
   `check.sh --e2e` green).

## Reference docs and skills

- **`docs/testing.md`** — the three test layers; what belongs in `web/e2e/`; the
  WebKit machine-conditional rule.
- **`CLAUDE.md`** — "new user-visible flows get a Playwright touch"; British vs
  US spelling split (does not affect these specs' code).
- **`web/e2e/helpers/auth.ts`** — the `register` / `uniqueUsername` idiom; the
  `invites` / `privacy` / `block` specs are worked examples.

## Open questions

- **`delete-account` post-deletion route.** Almost certainly `/auth/signin`, but
  the exact route (and whether a query/state is appended) is verified against the
  running app in Task 1.2 rather than assumed here.
- **`block.spec.ts` (b) root cause.** Treated as a spec capture bug (Task 2.1
  diagnoses first). Default if it proves to be a product bug: stop and escalate,
  since a product fix is out of scope (R6).
