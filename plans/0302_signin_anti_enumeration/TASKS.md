# Tasks

## Reference skills and docs

- **`docs/admin.md`** lines 159–185 — the anti-enumeration contract.
  Line 165 has the canonical post-submit copy; lines 181–185 are the
  three operative rules.
- **`docs/development.md`** lines 226–235 — the _Forward-note for
  step 13_ paragraph that Phase 0 reconciles.
- **`design/cairn-screens.jsx`** lines 167, 207–208 — the canonical
  copy strings; lines 295–376 — the _02b · One screen, five
  outcomes_ artboard.
- **`docs/testing.md`** — three-layer testing convention; this plan
  touches Vitest + Playwright, no pgTAP.
- **`docs/quality.md`** — `pnpm check` typing rules; inline comments
  must survive Prettier.
- **`plans/0301_gate_dev_login/TASKS.md`** — the format precedent.

## Phase 0 — reconcile `docs/development.md`

### [x] 0.1 Re-cast the anti-enumeration paragraph in past tense (DOC)

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T07:26:07Z

**Why:** `docs/development.md:230` describes the _current_ state of
`LoginRequest.svelte` as broken (_"Step 3's `LoginRequest` screen
surfaces the 4xx as an inline error, so the oracle is directly
visible in the UI"_) and names the fix as future (_"Step 13's
auth-screen hardening MUST collapse known/unknown responses…"_).
Once this plan's Phase 2 lands, both halves of that prose
contradict reality. Cairn is pre-alpha; living docs that diverge
from shipped behaviour are a known trap
(`CLAUDE.md` → _"Where we are in the build"_). The doc edit lands
first so no in-flight commit references a stale spec — same
ordering 0301 used for its `docs/deployment.md` reconciliation.

**Prerequisites:** None.

**Decisions:**

- Rewrite the paragraph at `docs/development.md:230` (the one that
  begins _"Separately, with `GOTRUE_DISABLE_SIGNUP=true`…"_) in
  past tense. Keep the explanation of _why_ the GoTrue status
  split is an enumeration oracle — that's still load-bearing
  context for anyone reading the doc — but re-cast the
  "`LoginRequest` surfaces the 4xx as an inline error" and "Step
  13's auth-screen hardening MUST…" halves to point at this plan
  as the resolved-state record.
- Drafted replacement (keep line-count comparable; the paragraph
  is part of a checklist-style section and should stay scannable):

  > Separately, with `GOTRUE_DISABLE_SIGNUP=true` the `POST
/auth/magiclink` endpoint returns 4xx for unknown emails and
  > 200 for known ones. The status split is an account-existence
  > oracle: anyone with a list of candidate emails can confirm
  > registered accounts, which contradicts Cairn's email-privacy
  > stance (`docs/invites.md` — email is never social information).
  > Step 3's initial `LoginRequest` surfaced the 4xx as an inline
  > error and the 5xx as a snackbar, exposing the oracle directly
  > in the UI; `plans/0302_signin_anti_enumeration/` closed that
  > gap by collapsing every non-2xx response (banned, unconfirmed,
  > rate-limited, unknown) into the same `/auth/check` destination
  > with the same copy as the success path, per the structural
  > contract in `docs/admin.md` → _"What the web app shows when a
  > banned user tries to sign in"_. Dev's
  > `GOTRUE_DISABLE_SIGNUP="false"` doesn't trigger the underlying
  > split, so the contract is verified by the route-mock in
  > `web/e2e/auth.spec.ts` rather than by GoTrue itself.

- Do not touch the _Forward-note for step 13 (production
  rollout)_ heading on line 226 even though "step 13" is also
  stale (the master plan now numbers production rollout as
  step 14). That mis-numbering is a separate pre-existing doc
  bug; folding it into 0302 is scope creep.

**Reference:** `plans/0301_gate_dev_login/TASKS.md` Task 0.1 — the
shape of a past-tense doc reconciliation and the _"doc edit lands
first"_ convention.

**Files:**

- `docs/development.md` (modify — paragraph at line 230)

**Steps:**

1. DOC — replace the paragraph at `docs/development.md:230` with
   the drafted replacement above, preserving the surrounding
   paragraphs (the _Forward-note_ paragraph at line 226 and the
   _Dev cookie-plant narrowing_ paragraph at line 232).
2. DOC — run `cd web && pnpm exec prettier --write ../docs/development.md`.
   `pnpm format` resolves `.` against `web/` and won't reach the
   repo-root `docs/` tree (same gap 0301's Phase 0 inherited);
   targeting the file explicitly side-steps it while still using
   `web/.prettierrc`. Prettier owns `.md` per `docs/quality.md`.

**Verify:** manual read — the paragraph reads as a settled record,
not a TODO · `cd web && pnpm exec prettier --check ../docs/development.md`

## Phase 1 — Vitest tests (RED)

### [x] 1.1 Rewrite `LoginRequest.test.ts` cases (d), (e), (f) for the new contract

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T07:27:42Z

**Why:** The current cases assert presence of the inline error
and snackbar on 4xx, 5xx, and network failure — the exact
distinguishability that breaks the anti-enumeration contract from
`docs/admin.md:181-185`. Flipping them to assert _absence_ +
navigation locks in the new shape before the component changes
in Phase 2.

**Prerequisites:** None. The current
`web/src/lib/auth/components/LoginRequest.test.ts` is the
behavioural baseline.

**Decisions:**

- Three cases get rewritten. The remaining cases — (a), (b), (c),
  (h), (j), (n) — stay verbatim. They cover input validation,
  cross-form gating with dev shortcuts, success-path navigation,
  dev-shortcut-disabled rendering, dev-shortcut in-flight gating,
  and absence of `<header>` chrome respectively, and none of them
  touch the surface this plan changes.
- Use the same `await tick(); await tick();` chain that the
  existing success-path `(c)` uses, not `vi.waitFor`. The
  `.catch(() => {})` rewrite in Task 2.1 consumes the rejection
  inside the same microtask the awaited promise settled in, and
  `setPendingLogin` + `goto` then run on the same chain as today's
  success path — so the post-GREEN microtask shape is identical
  to `(c)`. The tick-chain pattern keeps RED snappy (each failing
  assertion fails instantly, instead of paying `vi.waitFor`'s
  default 1 s timeout three times under current code) and matches
  the file's existing idiom.
- Rewritten (d) — _"4xx still navigates to `/auth/check` and
  shows no inline error"_:
  ```ts
  test("(d) 4xx still navigates to /auth/check, sets pendingLogin, shows no error UI", async () => {
  	vi.mocked(sendMagicLink).mockRejectedValueOnce(
  		new HttpError(400, "invalid email"),
  	);
  	const { getByDataTest, queryByDataTest } = render(LoginRequest);
  	await fireEvent.input(getByDataTest("login-email"), {
  		target: { value: "alice@example.test" },
  	});
  	await fireEvent.click(getByDataTest("login-submit"));
  	await tick();
  	await tick();
  	expect(vi.mocked(goto)).toHaveBeenCalledWith("/auth/check");
  	expect(vi.mocked(setPendingLogin)).toHaveBeenCalledWith(
  		"alice@example.test",
  	);
  	expect(queryByDataTest("login-error")).toBeNull();
  });
  ```
- Rewritten (e) — _"5xx still navigates to `/auth/check`, no
  snackbar opens"_: the same shape as (d) with
  `new HttpError(503, 'service unavailable')` and an additional
  assertion that the snackbar is not in its `open` state. The
  cleanest way to assert "snackbar didn't open" without coupling
  to Snackbar's internal markup is to grep its rendered DOM —
  the existing `data-test="login-snackbar"` is on the Snackbar
  component, which wraps the entire visible markup in
  `{#if open}` (see `web/src/lib/shared/components/Snackbar.svelte:25`),
  so `queryByDataTest('login-snackbar')` returns `null` whenever
  `open === false`. Assert that null. The fake-timers wrapping is
  no longer needed — there's no auto-close behaviour to wait
  through.
- Rewritten (f) — same shape as (e) with
  `new TypeError('Failed to fetch')`. Asserts both
  `queryByDataTest('login-error')` is null and the snackbar
  doesn't surface.
- The `HttpError` import stays — (d) and (e) still construct
  `HttpError` instances for the mock. `TypeError` stays a
  globally-available constructor; no import.
- Tests run RED against the current `LoginRequest.svelte`: today
  the catch block sets `inlineError` on 4xx and `errorSnack` on
  5xx / network, so the new "no error UI" assertions fail. Phase
  2.1 turns them green.

**Reference:** `web/src/lib/shared/components/Snackbar.svelte` —
read once to pick the right "didn't open" assertion shape.
`web/src/lib/test/render.ts` exposes `render`, `getByDataTest`,
`queryByDataTest`.

**Files:**

- `web/src/lib/auth/components/LoginRequest.test.ts` (modify)

**Steps:**

1. PREP — read `web/src/lib/shared/components/Snackbar.svelte` to
   pick the right "didn't open" assertion shape (likely a
   `queryByDataTest('login-snackbar')` returning `null` when the
   `open` prop is false; confirm before writing).
2. RED — replace the bodies of cases (d), (e), (f) per the
   Decisions above. Keep the test IDs `(d)`, `(e)`, `(f)`
   stable; the file's other cases reference them as siblings
   only in description, not by import, so the numbering is
   cosmetic but worth preserving.
3. RED — drop the `vi.useFakeTimers()` wrapping from (e) and (f);
   it was there for the snackbar's 6 s auto-close, which no
   longer fires on these paths.
4. RED — run `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts`
   and confirm cases (d), (e), (f) report red while all other
   cases stay green.

**Verify:** `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts`

### [x] 1.2 Add a "Sent again." appears on failure case to `LoginCheck.test.ts`

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T07:40:27Z

**Why:** `LoginCheck.svelte`'s `onSendAgain` currently sets
`confirmation = true` only on success — on failure the button
re-enables and nothing else happens. That's a distinguishability
leak at the same endpoint (`POST /auth/magiclink`) as the submit,
and `docs/admin.md:185` is explicit: _"the same button on every
screen, with the same effect, is fine."_ The new case asserts
the post-fix behaviour: failure also flips the confirmation.

**Prerequisites:** None. The current
`web/src/lib/auth/components/LoginCheck.test.ts` already mocks
`sendMagicLink` and has a success-path "Sent again." case to
mirror.

**Decisions:**

- New case appends at the end of the `describe` block, after the
  existing `(e) no <header> chrome rendered` case (currently at
  `LoginCheck.test.ts:76`). Label it `(f)` — `(e)` is taken.
- The case mocks `sendMagicLink` to reject with `new HttpError(400,
'banned')`. Imports `HttpError` from `$lib/auth/model/auth-client`
  (it's already mocked at the suite level; the import is for the
  constructor).
- Body sketch (mirrors (d)'s fake-timer wrapping so the 3 s
  auto-clear doesn't leak past the test):

  ```ts
  test('(f) "Sent again." appears even when sendMagicLink rejects (anti-enumeration)', async () => {
  	vi.useFakeTimers();
  	try {
  		vi.mocked(sendMagicLink).mockRejectedValueOnce(
  			new HttpError(400, "banned"),
  		);
  		const { getByDataTest, queryByDataTest } = render(LoginCheck, {
  			email: "alice@example.test",
  		});
  		await fireEvent.click(getByDataTest("login-check-resend"));
  		await tick();
  		expect(
  			getByDataTest("login-check-resend-confirmation"),
  		).toBeInTheDocument();

  		vi.advanceTimersByTime(3001);
  		await tick();
  		expect(queryByDataTest("login-check-resend-confirmation")).toBeNull();
  	} finally {
  		vi.useRealTimers();
  	}
  });
  ```

- Fake timers are non-optional: `onSendAgain` arms a
  `setTimeout(..., 3000)` that flips `confirmation = false`.
  Without `vi.useFakeTimers()` the timer fires 3 s after the test
  ends on the destroyed component's `$state` closure — harmless
  but inconsistent with (d) and exactly the kind of leak the
  existing suite has paid the cost to avoid. The
  `vi.advanceTimersByTime(3001)` round-trip also gives this case
  the same auto-clear coverage that (d) has on the success path.
- `await tick()` after `fireEvent.click` matches the existing
  success-path (d): the rejection settles synchronously inside
  `.catch(() => {})` (the GREEN code in Task 2.2 appends it to
  the `sendMagicLink` call), `confirmation = true` runs on the
  same microtask, and one tick is enough to see the DOM update.

**Reference:** the existing success-path case in
`LoginCheck.test.ts` is the structural template; copy its mock
setup and `render` call.

**Files:**

- `web/src/lib/auth/components/LoginCheck.test.ts` (modify)

**Steps:**

1. PREP — read the existing `LoginCheck.test.ts` to find the
   right insertion point and confirm the `vi.mock(...)` setup,
   the import list, and the letter-naming convention.
2. RED — add the new case per the Decisions above. Import
   `HttpError` from `$lib/auth/model/auth-client` if it isn't
   already.
3. RED — run `cd web && pnpm test src/lib/auth/components/LoginCheck.test.ts`
   and confirm the new case reports red (the existing
   `onSendAgain` only sets `confirmation = true` on success).
   Other cases stay green.

**Verify:** `cd web && pnpm test src/lib/auth/components/LoginCheck.test.ts`

## Phase 2 — code changes (GREEN)

### [x] 2.1 Rewrite `onSubmit` in `LoginRequest.svelte` + copy fix

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T08:00:06Z

**Notes:**

- Side work: updated the `goto` mock in `LoginRequest.test.ts` from
  `vi.fn()` to `vi.fn(() => Promise.resolve())`. The plan committed
  to `.catch(() => {})` on `goto`, which requires the mock to return
  a promise (matching real SvelteKit `goto`). Without it the test
  run had 5 unhandled `TypeError: Cannot read properties of undefined
(reading 'catch')` from the post-GREEN code — every test still
  passed assertions, but the unhandled-rejection noise would mask
  future real rejections.

**Why:** Turn Task 1.1's RED cases green by removing the magic-link
path's branching into inline error and snackbar, and land the
design-handoff copy fix for the `.hint` block in the same change.
The `HttpError` import and `isHttpError400` helper become dead and
go with the rewrite.

**Prerequisites:** Task 1.1 (the three cases are red and waiting).

**Decisions:**

- Final `onSubmit`:
  ```ts
  async function onSubmit(event: Event) {
  	event.preventDefault();
  	if (!emailValid || sending) return;
  	sending = true;
  	inlineError = null;
  	try {
  		// Anti-enumeration: any GoTrue outcome (link sent, banned,
  		// unconfirmed, rate-limited, unknown email) renders the same
  		// post-submit screen. See docs/admin.md → "What the web app
  		// shows when a banned user tries to sign in."
  		await sendMagicLink(email).catch(() => {});
  		setPendingLogin(email);
  		await goto(resolve("/auth/check")).catch(() => {});
  	} finally {
  		sending = false;
  	}
  }
  ```
- The `.catch(() => {})` on `goto` is load-bearing: the old outer
  `catch` block routed _any_ in-try rejection (including a
  `goto()` rejection from an interrupted same-app navigation) to
  `errorSnack`. Dropping the outer `catch` without guarding `goto`
  would turn that path into an unhandled promise rejection.
  Same-app `goto` rarely rejects, but the safety net is worth the
  five characters.
- Keep the `inlineError = null` reset — it still serves the
  dev-shortcut path, which can set `inlineError` via the
  `onInlineError` callback, and a magic-link submit afterwards
  should clear that stale state.
- Drop the `HttpError` import on line 8 (keep `sendMagicLink`).
- Drop the `isHttpError400` helper on lines 41–43.
- Update the `.hint` block (lines 102–105) to:
  ```svelte
  <div class="hint">
    No password. We'll e-mail you a link to continue.<br />
    Your data lives on a small server in Germany.
  </div>
  ```
  (one word replaced: _"a link that signs you in"_ →
  _"a link to continue"_).
- Do **not** touch the `Snackbar` element on lines 118–123 or the
  `{#if inlineError}` block on lines 87–89. They remain in the
  template for the dev-shortcut path; in prod they're never
  reached because 0301 strips `DevShortcuts.svelte` from the
  bundle, and at runtime neither `inlineError` nor `errorSnack`
  is set by the magic-link path any more.
- The `SNACKBAR_MESSAGE` constant on line 14 stays — it still
  feeds the snackbar's `message` prop on the dev path.

**Reference:** `web/src/lib/auth/components/DevShortcuts.svelte`
keeps using the parent's `onInlineError` and `onServerError`
callbacks; the parent's snackbar + inline-error UI lives for that
consumer alone.

**Files:**

- `web/src/lib/auth/components/LoginRequest.svelte` (modify)

**Steps:**

1. GREEN — apply the `onSubmit` rewrite per the Decisions above.
2. GREEN — drop the `HttpError` import (line 8 — keep
   `sendMagicLink`) and the `isHttpError400` helper (lines 41–43).
3. GREEN — update the `.hint` text per the Decisions above.
4. GREEN — run `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts`;
   confirm all cases green, including the rewritten (d), (e),
   (f). If any of the dev-shortcut integration cases (b), (j),
   or (h) regress, that's a real failure — the parent still
   provides `inlineError` / `errorSnack` for the dev shortcut.
5. GREEN — run `cd web && pnpm check` to catch typing fallout
   from the dropped imports.

**Verify:** `cd web && pnpm test src/lib/auth/components/LoginRequest.test.ts` · `cd web && pnpm check`

### [x] 2.2 Patch `onSendAgain` and update copy in `LoginCheck.svelte`

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T08:16:18Z

**Why:** Turn Task 1.2's RED case green by making the resend
confirmation appear regardless of `sendMagicLink`'s outcome, and
land the _"continue"_ copy fix for the body text in the same
change.

**Prerequisites:** Task 1.2 (the new case is red and waiting).

**Decisions:**

- Final `onSendAgain`:
  ```ts
  async function onSendAgain() {
  	if (sending) return;
  	sending = true;
  	try {
  		// Anti-enumeration: show the same confirmation regardless
  		// of GoTrue's response. See docs/admin.md → "Don't add a
  		// 'resend' button that distinguishes failure modes."
  		await sendMagicLink(email).catch(() => {});
  		confirmation = true;
  		if (confirmationTimer !== null) clearTimeout(confirmationTimer);
  		confirmationTimer = setTimeout(() => {
  			confirmation = false;
  			confirmationTimer = null;
  		}, 3000);
  	} finally {
  		sending = false;
  	}
  }
  ```
  Single-line behavioural change: append `.catch(() => {})` to
  the `sendMagicLink(email)` call. The confirmation flip and the
  timer arming move out from "only on success" to "on every
  path."
- Update the `.body` paragraph (lines 36–39) to:
  ```svelte
  <p class="body">
    We sent a link to <b data-test="login-check-email">{email}</b>.
    Tap it on this device to continue.
  </p>
  ```
  One word replaced: _"to sign in"_ → _"to continue"_.

**Reference:** `docs/admin.md:165` and
`design/cairn-screens.jsx:208` — both quote _"Tap it on this
device to continue"_ verbatim. The Svelte has been drifting; this
brings it back.

**Files:**

- `web/src/lib/auth/components/LoginCheck.svelte` (modify)

**Steps:**

1. GREEN — apply the `.catch(() => {})` change to `onSendAgain`
   and add the comment per the Decisions above.
2. GREEN — update the `.body` text per the Decisions above.
3. GREEN — run `cd web && pnpm test src/lib/auth/components/LoginCheck.test.ts`;
   confirm all cases green, including the new failure-still-
   confirms case from Task 1.2.
4. GREEN — run `cd web && pnpm check`.

**Verify:** `cd web && pnpm test src/lib/auth/components/LoginCheck.test.ts` · `cd web && pnpm check`

## Phase 3 — Playwright + close-out

### [x] 3.1 Add the non-2xx route-mock test to `auth.spec.ts`

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T08:28:18Z

**Notes:**

- Verifier `pnpm test:e2e -- auth.spec.ts` only fully passes on
  chromium in this dev environment — firefox/webkit fail with
  _Host system is missing dependencies_ (the fallback ubuntu24
  build needs `libicu74`/`libjpeg-turbo8`/`gstreamer1.0-libav`,
  which require root to install on this Fedora host). Both the
  pre-existing happy-path test and the new anti-enumeration test
  pass on `--project=chromium`. CI installs system deps via the
  official Playwright Docker image, so cross-browser coverage is
  unaffected — flagging the local-only gap.

**Why:** Lock the contract in at the full-stack layer: a real
browser, the real Svelte build, route-intercepted GoTrue
returning a non-2xx, and an assertion that the page still lands
on `/auth/check` showing the same heading and email text as the
happy path. This is the only layer that catches a regression
where the JS still hits a code path that mounts an error UI in a
real DOM. Required by R4.

**Prerequisites:** Tasks 2.1 and 2.2 (the component changes have
landed).

**Decisions:**

- The existing happy-path test stays untouched. The new test
  goes after it as a second `test(...)` block.
- Use `page.route('**/auth/magiclink*', route => route.fulfill({
status: 429, contentType: 'application/json', body: '{}' }))`
  to intercept before the navigation that submits the form. The
  route handler runs at the page level — `page.route` is set
  before `page.goto('/')` so the first matching request is
  intercepted.
- 429 (rate-limit) is the most realistic non-2xx — banning is
  out-of-band, but a real user can trip rate-limiting by
  hammering the resend button. The body is `'{}'` to avoid JSON
  parse failures in the client.
- Assertions:
  1. URL ends in `/auth/check` (anchor with `$` like the existing
     test).
  2. `[data-test="login-check-heading"]` reads _"Check your inbox"_.
  3. `[data-test="login-check-email"]` reads the same email the
     test typed.
- Do **not** wait for or assert a Mailpit email — the route mock
  short-circuits before the request reaches GoTrue, so no email
  arrives by design.
- Do **not** add a sign-out step. The user can't actually sign
  in via this path (no real link was sent); the test ends after
  the `/auth/check` assertion.
- Test name: `'magic-link non-2xx still lands on /auth/check
(anti-enumeration)'`.

**Reference:** `web/e2e/auth.spec.ts` — the existing happy-path
test is the structural template; reuse the
`alice+${test.info().testId}@example.test` email shape so a
parallel run can't cross-talk. `page.route` docs:
<https://playwright.dev/docs/api/class-page#page-route> — but
the existing tests in `web/e2e/` are the right reference for the
project's idiom.

**Files:**

- `web/e2e/auth.spec.ts` (modify)

**Steps:**

1. GREEN — add the new test block at the end of `auth.spec.ts`.
   Set up `page.route` before `page.goto('/')` so the first
   submit gets the mocked 429. (This task locks the contract in
   at the e2e layer _after_ Phase 2 lands; the test is expected
   to pass on first run, not start red.)
2. GREEN — run `cd web && pnpm test:e2e -- auth.spec.ts` and
   confirm both tests pass. If the new test fails, the component
   still has a branch that surfaces the error UI in a real DOM
   and Phase 2 missed something.

**Verify:** `cd web && pnpm test:e2e -- auth.spec.ts`

### [x] 3.2 Full check + tick the master plan + commit close-out

**Created:** 2026-05-21T13:47:35Z
**Completed:** 2026-05-22T08:39:07Z

**Notes:**

- `./scripts/check.sh --e2e` was green for every layer (prettier,
  eslint, svelte-check, sqlfluff, shellcheck, shfmt, pgTAP, vitest)
  and for the chromium and firefox Playwright projects. Webkit
  failed for both tests (pre-existing + new) with _Host system is
  missing dependencies_ — same environment limitation flagged in
  Task 3.1's Notes (Fedora host needs root to install
  `libicu74`/`libjpeg-turbo8`/`gstreamer1.0-libav` for the
  ubuntu24 fallback build). Not a regression: the same webkit
  failure reproduces on `main` once the missing libs are absent,
  and CI's Playwright Docker image has them. Phases 0, 2.1, 2.2,
  and 3.1 already landed as separate commits during development;
  this final commit covers only the master-plan tick and TASKS.md
  close-out.

**Why:** Run the cross-layer check to catch any regression
introduced by the component changes (lint, type, pgTAP, Vitest,
Playwright), then tick the `[ ] 0302` checkbox in the master
plan in the close-out commit. 0301 used the same shape (Task
3.1 there): a single sweep + a single tick + a `feat(auth):`
commit message.

**Prerequisites:** Task 3.1 (the Playwright test exists).

**Decisions:**

- Run `./scripts/check.sh --e2e` from the repo root. This runs:
  Prettier, ESLint, svelte-check, SQLFluff, ShellCheck, shfmt,
  pgTAP, Vitest, and Playwright in sequence.
- Tick `[ ] 0302` → `[x] 0302` at
  `plans/0000_implementation_order.md:80`. The line is the
  `0302:` sub-bullet under step 3.
- Commit-message domain: `feat(auth):`. The visible behavioural
  delta is in the auth surface (the sign-in screens), and
  shipping the contract is a user-protecting feature, not a
  chore. Single commit at the end of the work is the cleanest
  shape; if Phase 0, Phase 2.1, and Phase 2.2 each landed as
  separate commits during development, that's fine — squash
  judgement is at the user's discretion at PR time.
- If `./scripts/check.sh --e2e` reports the pre-existing
  callback-flow failure noted at the end of
  `plans/0301_gate_dev_login/TASKS.md` (`auth.spec.ts:28` — the
  callback page not stripping the hash), flag it in the Notes
  but do not let it block this plan. Cross-check by running
  the same command on `main` to confirm the failure is
  pre-existing, not regression.

**Reference:** `plans/0301_gate_dev_login/TASKS.md` Task 3.1 —
the close-out shape; `plans/0000_implementation_order.md:80` —
the exact line to tick.

**Files:**

- `plans/0000_implementation_order.md` (modify — tick `0302`)
- `plans/0302_signin_anti_enumeration/TASKS.md` (modify — tick
  each task's checkbox and fill `Completed:` timestamps as the
  work lands)

**Steps:**

1. GREEN — run `./scripts/check.sh --e2e` from the repo root.
   All layers green is the target. If Playwright reports a
   failure, identify whether it's the new test or a
   pre-existing flake (run on `main` to compare).
2. GREEN — flip `[ ] 0302` → `[x] 0302` at
   `plans/0000_implementation_order.md:80`.
3. GREEN — flip each `[ ] N.M` → `[x] N.M` in this file as the
   tasks land; fill `Completed:` timestamps on the same edit.
4. GREEN — commit the work. If the phases landed as separate
   commits, this final commit covers the tick of the master
   plan and the TASKS.md state. If everything is one commit,
   the message is something like:
   ```
   feat(auth): honour magic-link anti-enumeration contract in sign-in UI
   ```

**Verify:** `./scripts/check.sh --e2e` · `git status` after the
close-out commit shows a clean tree on `0302_signin_anti_enumeration`.
