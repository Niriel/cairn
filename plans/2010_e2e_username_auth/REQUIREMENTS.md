# Requirements: repair the e2e suite for username auth

The Playwright suite accumulated failures when step 2003 made username +
password the real sign-in path: the unauthenticated root now redirects to
`/auth/signin`, not the magic-link `/auth/login`, so every spec that logged in
via `goto('/')` → `login-email` → `waitForMagicLink` broke. They went unnoticed
because the maintainer was working from a laptop that can't run e2e at all; they
surfaced when the full suite was finally run during `2005_add_by_username` task
4.1 (16 failures across 8 specs). This work restores the suite to green on the
browsers this box can run, so the `2005` merge — whose gate needs
`./scripts/check.sh --e2e` green — is unblocked. It is **test-suite hygiene**,
not the prod-facing `2006` alpha migration.

## R1. Specs authenticate through the shipped username flow, not magic-link

Every spec that needs a signed-in user obtains one through
`web/e2e/helpers/auth.ts` — `register(page, uniqueUsername(prefix), PASSWORD)`
for a fresh isolated account (the default), or `signInWithPassword` when a spec
re-signs an existing account. Landing on `/lists` is the post-auth contract. No
in-scope spec may sign itself in via the magic-link flow: no `goto('/')`
asserting `/auth/login`, no `login-email` fill, no `waitForMagicLink` call, and
no `./helpers/mailpit` import for the purpose of logging in. Each migrated spec
drops its now-unused `mailpit` import.

The unique-per-run username (`uniqueUsername`) keeps parallel specs and repeated
runs against the shared dev DB from colliding on the case-fold uniqueness index.

## R2. The seven migrated specs keep their existing behavioural coverage

`avatar`, `delete-account`, `export`, `items`, `public-list`, `welcome`, and
`imprint` retain every assertion they made before — only the sign-in preamble
(and the two route assertions in R4/R5-adjacent specs) changes. Concretely, the
post-migration specs still exercise: avatar upload/crop/remove + display-name
save; the gated delete-account confirm and confirmation view; the export
prepare/download of a real ZIP and the delete-account export nudge; the items
create/score-sort/vote/edit/delete-undo flow; publish + copy-link + the
signed-out `/p/<id>` read-only view and the private-list "not available" case;
and the welcome banner.

## R3. The welcome banner still triggers for a freshly-registered user

`WelcomeBanner.svelte` renders only when `profile.displayName === 'New user'`,
which the signup trigger (`db/migrations/0019_username_identity.sql`) sets for
every new account. A `register()`ed user must therefore still see the banner, so
`welcome.spec.ts` keeps asserting it after the sign-in swap. If registration
ever stops defaulting the name to `'New user'`, the spec must be reworked rather
than silently dropped — but the current contract is that it does.

## R4. The imprint touch works from the current pre-auth landing

The imprint page is reachable pre-auth from the sign-in screen footer. Since the
root redirects to `/auth/signin`, `imprint.spec.ts` navigates to that landing and
follows the sign-in screen's imprint link — `data-test="signin-imprint-link"`
(`SignIn.svelte`), not the magic-link screen's `login-imprint-link`. It still
asserts the imprint screen renders with its operator, address, and `@`-bearing
e-mail lines. No authentication is involved.

## R5. `delete-account`'s post-deletion return lands on the real sign-in route

After the account is deleted, the "Back to sign in" control returns the user to
the app's current sign-in screen. The spec asserts the route the app actually
navigates to post-deletion (verified against the running app), replacing the
stale `/auth/login` expectation.

## R6. The blocked-invite spec asserts the block outcome, not a mis-captured list

`block.spec.ts` step (b) must send Bob's invite to a list Alice is **not** a
member of, so the assertion exercises the block path — `send_invitation` returns
the silent-fail outcome and the picker shows the generic "Couldn't send invite"
toast (the anti-enumeration guarantee: indistinguishable from a restrictive
policy). The spec's target-list id is captured deterministically (a name-scoped
locator, or navigate-into-the-list-and-read-`page.url()`), never
`[data-test^="list-nav-"].first()`, which raced/ordered onto the shared list
(where Alice is a member) and produced the wrong "They're already on this list."
toast. If diagnosis shows the wrong toast is a genuine product bug in
`send_invitation`'s membership-vs-block ordering rather than a spec capture bug,
that is out of scope for this test-repair plan — stop and escalate.

## R7. The full suite is green on chromium + firefox, and `check.sh` passes

`cd web && pnpm exec playwright test --project=chromium --project=firefox` passes
across the whole suite — the eight formerly-failing specs plus the specs that
already passed (`invites`, `privacy`, `auth`, `password-recovery`). WebKit is
**not** run on this box (missing system libraries — a standing
machine-conditional rule, `docs/testing.md`). `./scripts/check.sh` (the non-e2e
gauntlet) also passes, since the only edits are to test files.

## Non-requirements (explicitly excluded)

- **The prod-facing `2006` alpha migration** — backfilling `profiles.username`
  from display names, the initial-password path for grandfathered users, and
  actually _removing_ the magic-link / e-mail-OTP sign-in surface. This plan only
  stops the specs from _using_ magic-link for their own login; it does not touch
  the login surface itself.
- **`auth.spec.ts` and `password-recovery.spec.ts`** — they legitimately
  exercise the magic-link and recovery-mail flows (via the mailpit helper). Their
  flows are not migrated, and the `web/e2e/helpers/mailpit.ts` helper stays for
  them. **Exception (added during Task 3.1, user-directed):** the full-suite run
  surfaced `password-recovery.spec.ts` failing because it keyed its recovery
  address off the run-stable `test.info().testId`, which trips the shared stack's
  per-address OTP throttle across repeated runs. The one narrow fix applied was to
  derive that address from the unique-per-run `username` instead; the recovery
  _flow_ and the mailpit helper are otherwise untouched. `auth.spec.ts` remains
  entirely untouched.
- **New product behaviour or new e2e coverage** — beyond restoring the existing
  assertions and the deterministic list-capture fix in `block.spec.ts`, no new
  scenarios are added here.
- **WebKit execution** — remains unrun locally; unchanged by this plan.
