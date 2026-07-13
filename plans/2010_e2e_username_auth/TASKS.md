# Tasks

Repair the Playwright suite that broke when step 2003 moved the unauthenticated
root redirect from the magic-link `/auth/login` to the username `/auth/signin`.
Migrate the specs that still self-sign-in via magic-link onto the shipped
username flow, fix one blocked-invite spec that captured the wrong list, and
gate on a green full-suite run (chromium + firefox). Test-only work — no product
code changes.

## Reference skills and docs

- **`docs/testing.md`** — three test layers; what belongs in `web/e2e/`; WebKit
  is not run on this box (missing system libs — standing machine rule).
- **`web/e2e/helpers/auth.ts`** — `register(page, uniqueUsername(prefix),
PASSWORD)` (fresh account, lands on `/lists`), `signInWithPassword`,
  `uniqueUsername`. The `invites` / `privacy` / `block` specs are worked
  examples of the idiom.
- **`CLAUDE.md`** — "new user-visible flows get a Playwright touch"; commit
  messages carry a domain in parens (`test(e2e):`).

## How to run e2e here

The backend stack (`docker compose up -d` + migrations) must already be up;
Playwright's `webServer` auto-starts `pnpm dev` (or reuses a running one). Always
pass `--project=chromium --project=firefox` — **never run WebKit** (it can't
start on this Fedora box). A single spec:
`cd web && pnpm exec playwright test <spec>.spec.ts --project=chromium --project=firefox`.

## Phase 1 — migrate the magic-link specs onto username auth

### [x] 1.1 Swap the five straight-swap specs onto `register()`

**Created:** 2026-07-13T12:52:56Z
**Completed:** 2026-07-13T13:04:18Z

**Why:** `avatar`, `export`, `items`, `public-list`, and `welcome` each log in
through the retired magic-link flow (`goto('/')` expecting `/auth/login`, filling
`login-email`, then `waitForMagicLink`). Since step 2003 the root redirects to
`/auth/signin`, so all five fail before their first assertion. Their post-login
coverage is still valuable; only the sign-in preamble is stale.

**Prerequisites:** None. `web/e2e/helpers/auth.ts` (`register`, `uniqueUsername`)
already exists on this branch's base and is used by `invites`/`privacy`/`block`.

**Decisions:**

- In each of the five specs, replace the magic-link `beforeAll` login block —
  the `page.goto('/')`, the `toHaveURL(/\/auth\/login$/)` / `/auth/check$/`
  assertions, the `login-email` fill + `login-submit` click, and the
  `waitForMagicLink(email)` + `page.goto(link)` — with a single
  `await register(page, uniqueUsername('<prefix>'), PASSWORD);` that lands on
  `/lists`. Import `register` / `uniqueUsername` from `./helpers/auth`.
- Define a `const PASSWORD = 'cairn-e2e-pw';` in each spec (matches the idiom in
  `invites`/`privacy`/`block`).
- **Remove the now-unused `import { waitForMagicLink } from './helpers/mailpit';`**
  from each — nothing else in these five uses it. Drop the per-spec `email`
  variable if it's now unreferenced.
- Everything after login is unchanged: avatar upload/crop/remove + display-name
  save; export prepare/download + the delete-account export nudge; items
  create/score-sort/vote/edit/delete-undo; publish + copy-link + the anon
  `/p/<id>` read-only and private "not available" cases; the welcome banner.
- `welcome.spec.ts` keeps asserting the banner: `WelcomeBanner.svelte` renders
  when `profile.displayName === 'New user'`, which the signup trigger
  (`db/migrations/0019_username_identity.sql`) sets for every new account, so a
  `register()`ed user still sees it. (If the banner does **not** appear, stop —
  the default-name contract changed and the spec needs rethinking, not a hack.)
- `avatar.spec.ts` has a `SKIP_E2E` env guard on its `beforeAll`/tests; leave
  that mechanism intact, just swap the login call inside it.
- Use a distinct `uniqueUsername` prefix per spec (e.g. `avataruser`,
  `exportuser`, `itemsuser`, `publicuser`, `welcomeuser`) so parallel runs stay
  isolated. Prefix must be alphanumeric only (the `^[A-Za-z0-9]{3,30}$` rule).

**Reference:** `web/e2e/invites.spec.ts` `beforeAll` for the exact `register()`
idiom.

**Files:**

- `web/e2e/avatar.spec.ts` (modify)
- `web/e2e/export.spec.ts` (modify)
- `web/e2e/items.spec.ts` (modify)
- `web/e2e/public-list.spec.ts` (modify)
- `web/e2e/welcome.spec.ts` (modify)

**Steps:**

1. RED — Confirm the five specs fail today:
   `pnpm exec playwright test avatar.spec.ts export.spec.ts items.spec.ts public-list.spec.ts welcome.spec.ts --project=chromium`
   → each red at its `beforeAll` login (`/auth/login` never reached).
2. GREEN — In each spec, swap the login block for `register()`, add `PASSWORD`,
   remove the `mailpit` import + dead `email` var, per Decisions.
3. GREEN — Re-run the five on **chromium + firefox**; confirm green. Explicitly
   confirm the welcome banner still renders (R3).

**Verify:** `cd web && pnpm exec playwright test avatar.spec.ts export.spec.ts items.spec.ts public-list.spec.ts welcome.spec.ts --project=chromium --project=firefox` · `pnpm lint`

**Notes:**

- Green: all 5 specs pass on chromium + firefox (50/50 = 25 tests × 2), `pnpm
lint` clean, `tsc -p e2e/tsconfig.json` + prettier clean. RED confirmed first
  (all 5 failed at the magic-link `beforeAll`). Welcome banner still renders for
  a `register()`ed user, as predicted (R3).
- Prefixes used: `avataruser`, `exportuser`, `itemsuser`, `publicuser`,
  `welcomeuser`. `items`/`public-list` kept their `runId` (list-name suffix);
  `avatar`/`export`/`welcome` dropped `runId`+`email` entirely.
- **Unanticipated fix beyond the login swap — `public-list.spec.ts` clipboard
  permission.** The plan called these "straight swaps," but once login worked,
  `public-list` (b) failed on **chromium only**: `ListOverflowSheet.handleCopyLink`
  awaits `navigator.clipboard.writeText`, which headless chromium rejects without
  the `clipboard-write` permission (firefox is permissive and passed). This is a
  test-environment gap, not a product bug — the app copies fine in a real
  browser. Fixed in the spec by creating an explicit context and granting
  `['clipboard-read','clipboard-write']`, guarded by
  `browser.browserType().name() === 'chromium'` (the tokens are chromium-only, so
  granting them on firefox would throw). Surfaced now only because the spec
  previously died at login before ever reaching the copy step. Worth watching for
  the same class of permission gap in other specs as they come back online.

### [x] 1.2 Migrate `delete-account` and fix its post-deletion route

**Created:** 2026-07-13T12:52:56Z
**Completed:** 2026-07-13T13:07:38Z

**Why:** `delete-account.spec.ts` logs in via magic-link (broken since 2003) and,
in its last step, asserts that "Back to sign in" returns to `/auth/login` — a
route that is no longer the app's sign-in screen. Both must be corrected.

**Prerequisites:** Task 1.1 (same `register()` idiom).

**Decisions:**

- Swap the magic-link `beforeAll` for `await register(page,
uniqueUsername('deluser'), PASSWORD);` and remove the `mailpit` import + dead
  `email` var, exactly as in 1.1. The deletion happy path (Settings → Delete
  account, `delete`-gated confirm, confirmation view) is unchanged.
- **Fix the final route assertion.** Step (d) currently does
  `await expect(page).toHaveURL(/\/auth\/login$/)` after clicking
  `delete-account-signout`. Determine the route the app actually navigates to
  post-deletion by driving the flow against the running app, and assert that
  route (expected: `/auth/signin`). Do **not** hard-code an assumption — read it
  off the real navigation, then pin it.
- The deleted user is unique per run (`uniqueUsername`), so the deletion can't
  disturb other specs — preserve that property.

**Files:**

- `web/e2e/delete-account.spec.ts` (modify)

**Steps:**

1. RED — `pnpm exec playwright test delete-account.spec.ts --project=chromium`
   → red at the magic-link `beforeAll`.
2. GREEN — Swap in `register()`; drop the `mailpit` import + `email` var.
3. GREEN — Run once; observe where "Back to sign in" lands (the app's real
   sign-in route); update step (d)'s `toHaveURL` to match.
4. GREEN — Re-run on **chromium + firefox**; confirm all four steps green.

**Verify:** `cd web && pnpm exec playwright test delete-account.spec.ts --project=chromium --project=firefox` · `pnpm lint`

**Notes:**

- Green: 8/8 on chromium + firefox; eslint/prettier/`tsc -p e2e/tsconfig.json`
  clean. RED confirmed first. Post-deletion "Back to sign in" lands on
  **`/auth/signin`** (the `signout` handler + route guard), as the plan
  predicted — assertion pinned to that.

### [x] 1.3 Migrate `imprint` to the current pre-auth landing

**Created:** 2026-07-13T12:52:56Z
**Completed:** 2026-07-13T13:10:29Z

**Why:** `imprint.spec.ts` verifies the imprint page is reachable pre-auth from
the login footer. It navigates `goto('/')` → expects `/auth/login` → clicks
`login-imprint-link`. The root now lands on `/auth/signin`, whose footer link is
`signin-imprint-link`, so the spec fails at the URL assertion. No auth is
involved.

**Prerequisites:** None (independent of 1.1/1.2; no sign-in).

**Decisions:**

- Point the spec at the current pre-auth landing. Navigate `goto('/')` and assert
  it lands on `/auth/signin` (confirming the redirect), then click
  `[data-test="signin-imprint-link"]` (the imprint link on `SignIn.svelte`) and
  assert `/imprint`. The magic-link screen's `login-imprint-link` is a different
  screen and must not be used here.
- Keep the existing imprint-screen assertions unchanged: `imprint-screen`,
  `imprint-operator`, `imprint-address`, and `imprint-email` containing `@`.
- This spec imports nothing from `helpers/`; no import changes.

**Files:**

- `web/e2e/imprint.spec.ts` (modify)

**Steps:**

1. RED — `pnpm exec playwright test imprint.spec.ts --project=chromium` → red at
   the `/auth/login` URL assertion.
2. GREEN — Update the landing assertion to `/auth/signin` and the footer link to
   `signin-imprint-link`; keep the imprint-page assertions.
3. GREEN — Re-run on **chromium + firefox**; confirm green.

**Verify:** `cd web && pnpm exec playwright test imprint.spec.ts --project=chromium --project=firefox` · `pnpm lint`

## Phase 2 — fix the blocked-invite capture

### [x] 2.1 Make `block.spec.ts` (b) target the right list

**Created:** 2026-07-13T12:52:56Z
**Completed:** 2026-07-13T13:15:51Z

**Why:** `block.spec.ts` was migrated onto username auth in the `2005` task 2.1
follow-up but never executed until now. Step (b) — Bob (whom Alice has blocked)
invites Alice from _his own_ list and should get the generic "Couldn't send
invite" anti-enumeration toast — instead fails with "They're already on this
list.", meaning the invite was sent to a list Alice is already on. The target-list
id is being mis-captured.

**Prerequisites:** None (`block.spec.ts` already uses `register()`; this is a
capture fix, not an auth migration).

**Decisions:**

- **Diagnose first.** The suspect is the `beforeAll` capture
  `bobListId = (await bob.locator('[data-test^="list-nav-"]').first().getAttribute('data-test'))!.replace('list-nav-', '')`.
  After Bob accepts Alice's shared-list invite and then creates his own list,
  `.first()` can resolve to the **shared** list (which Alice created → she is a
  member) instead of Bob's new list, depending on list ordering / collection
  refresh timing. Sending an invite to the shared list hits the already-a-member
  branch, producing the observed toast. Confirm this by logging/observing which
  id `bobListId` holds vs. Bob's just-created list.
- **Fix deterministically.** Capture `bobListId` by identity, not position:
  either filter the nav locator by the created list's name
  (`bob.locator('[data-test^="list-nav-"]').filter({ hasText: \`Bob's list ${runId}\` })`)
and read its `data-test`, or navigate into the freshly-created list and read
`page.url().split('/lists/')[1]`(the idiom`public-list.spec.ts`uses). Apply
the same robustness to`sharedListId` if it shares the fragility.
- Step (b)'s expected toast stays "Couldn't send invite." — that generic string
  is the anti-enumeration guarantee (a block is indistinguishable from a
  restrictive policy), and it is explicitly **not** the "No one on Cairn has that
  username" a missing handle would give (Alice's account plainly exists).
- **Escalation guard (R6):** if diagnosis shows `bobListId` is in fact correct
  (points at Bob's own list, Alice not a member) and `send_invitation` still
  returns the already-a-member outcome, that is a genuine product bug in the
  membership-vs-block check ordering — **stop and report to the user**; a product
  fix + pgTAP is out of scope for this test-repair plan.

**Reference:** `web/e2e/public-list.spec.ts` `beforeAll` for the navigate-in +
`page.url()` capture idiom.

**Files:**

- `web/e2e/block.spec.ts` (modify)

**Steps:**

1. RED — `pnpm exec playwright test block.spec.ts --project=chromium` → step (b)
   red with the "They're already on this list." toast.
2. Diagnose — confirm `bobListId` is resolving to the shared list (not Bob's
   own). If instead it is correct, stop and escalate per the guard above.
3. GREEN — Replace the positional capture with a deterministic one per Decisions.
4. GREEN — Re-run on **chromium + firefox**; confirm (a) and (b) green, with (b)
   asserting the generic "Couldn't send invite" toast.

**Verify:** `cd web && pnpm exec playwright test block.spec.ts --project=chromium --project=firefox` · `pnpm lint`

**Notes:**

- **Diagnosis confirmed it's a spec capture bug, not a product bug** (escalation
  guard cleared). A one-line `console.log('DIAG', { sharedListId, bobListId,
sameList })` in the setup printed `sameList: true` — `bobListId` had captured
  the _shared_ list id (Alice's own), so step (b) invited Alice to a list she is
  already on, hence "They're already on this list." `send_invitation`'s
  membership-vs-block ordering is fine.
- Fix: capture `bobListId` by name —
  `.filter({ hasText: \`Bob's list ${runId}\` })`+`await
  expect(bobRow).toBeVisible()`before reading`data-test`— instead of`.first()`. `sharedListId`'s `.first()` capture is left as-is: it's read when
  Alice has exactly one list, so there is no ambiguity or race there.
- Green: 4/4 on chromium + firefox; (b) now asserts the generic "Couldn't send
  invite" (the anti-enumeration outcome, reached via the block path). Removed the
  diagnostic log. eslint/prettier/`tsc -p e2e/tsconfig.json`/`pnpm lint` clean.

## Phase 3 — full-suite green gate

### [x] 3.1 Whole suite green on chromium + firefox, and `check.sh`

**Created:** 2026-07-13T12:52:56Z
**Completed:** 2026-07-13T13:37:40Z

**Why:** The individual tasks verify their own specs, but the merge-readiness
contract (and the `2005` merge gate, task 5.1) is the _whole_ suite green on the
two runnable browsers plus a clean `check.sh`. This task is the checkpoint that
confirms nothing regressed and the shared dev DB isn't causing cross-spec
interference.

**Prerequisites:** Tasks 1.1–1.3 and 2.1.

**Decisions:**

- Run the entire suite: `cd web && pnpm exec playwright test --project=chromium
--project=firefox`. Expect **0 failures** — the eight formerly-failing specs
  plus the already-passing `invites` / `privacy` / `auth` / `password-recovery`.
- **Do not run WebKit** (missing system libs on this box — `docs/testing.md`).
  Note in this task's Notes that WebKit was deliberately skipped.
- Run `./scripts/check.sh` (non-e2e gauntlet); it must pass — the only edits are
  test files, covered by prettier/eslint.
- If a spec is flaky under full-suite parallelism but green in isolation, note
  it — shared-dev-DB contention is a known hazard; a genuine ordering bug in a
  spec's own setup is not acceptable and gets fixed, but transient
  cross-spec-DB flakiness is recorded, not papered over.

**Files:**

- (none — verification only)

**Steps:**

1. Run `cd web && pnpm exec playwright test --project=chromium --project=firefox`;
   confirm 0 failures across the whole suite.
2. Run `./scripts/check.sh`; confirm it passes.
3. Record the result (pass counts per browser; WebKit skipped) in Notes.

**Verify:** `cd web && pnpm exec playwright test --project=chromium --project=firefox` · `./scripts/check.sh`

**Notes:**

- **Green gate met:** full suite **108 passed / 0 failed** on chromium + firefox;
  `./scripts/check.sh` "all checks passed". **WebKit deliberately not run**
  (missing system libs on this Fedora box — `docs/testing.md` /
  [[playwright-webkit-fedora]]).
- **Deviation — a third spec needed a fix (user-directed, scope addition).** The
  first full-suite run was 105/3, with all 3 failures in `password-recovery.spec.ts`
  — a spec this plan had listed as an untouched non-requirement. Diagnosis: not
  mail delivery (the verify mail arrives) — `waitForRecoveryCode` returned a code
  from an _older_ mail while the `recovery-email-code` field never rendered,
  because the spec keyed its recovery address off `test.info().testId`, which is
  **stable across runs**. Reusing one address on the shared dev stack across this
  session's many runs tripped the per-address OTP send throttle, so the
  set-recovery call didn't advance the UI. Not caused by this plan's changes (no
  product/spec/helper edits to recovery; it passed during the 2005 4.1 run and
  broke on accumulated state). The user chose to fix it: derive the recovery
  address from the unique-per-run `username` (mirroring the existing
  `uniqueUsername` idiom) in both tests that set a recovery e-mail. The
  anti-enumeration `probe` address (which never receives mail) was left on the
  stable id. After the fix, `password-recovery` is 3/3 and the whole suite is
  green. This edits `web/e2e/password-recovery.spec.ts` — beyond 3.1's stated
  "verification only, no Files" shape; see the REQUIREMENTS non-requirement note.
- No cross-spec-DB flakiness observed on the final run.

## Merge / hand-off

Once every task is `[x]` and Task 3.1 is green: this branch can merge back so the
`2005` merge (its task 5.1, needing `./scripts/check.sh --e2e` green) is
unblocked. Coordinate the exact merge target (into `2005_add_by_username`, or
directly into `2000_username_identity` alongside it) with the maintainer at
merge time — it depends on whether `2005` has merged yet.
