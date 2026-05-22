# Plan: honour the magic-link anti-enumeration contract in the sign-in UI

Bring `LoginRequest.svelte`'s submit and `LoginCheck.svelte`'s
*Send again* button under the structural anti-enumeration contract
documented in `docs/admin.md` lines 159–185, and land the
design-handoff copy fixes the screens have been drifting from.
Must land before step 14's deploy so the contract is honoured on
day 1 of production.

## Context

`docs/admin.md:159–185` establishes the contract: every outcome
`POST /auth/magiclink` can produce — link sent, banned, unconfirmed,
rate-limited, unknown email — must render the identical post-submit
screen. *"The protection is structural, not rhetorical. The screen
is identical in every case, and that's the entire mechanism"*
(line 175). The design canvas captures this as the *"02b · One
screen, five outcomes — anti-enumeration by structure"* artboard
(`design/cairn-screens.jsx:295`), which spells out the five outcomes,
the three antipatterns *never* to render, and the operative rule:
*"The web app treats every non-2xx response from POST /auth/magiclink
as a success in the UI"* (`design/cairn-screens.jsx:364-370`).

`LoginRequest.svelte` violates the contract today. Lines 87–89 render
an inline error on 4xx (*"Please check the e-mail and try again."*);
lines 118–123 flip a snackbar (*"Couldn't reach the server. Try
again."*) on 5xx and network failure. Either is a one-shot
enumeration oracle: a probe with a banned email yields an inline
error, a probe with a healthy unknown email might also, and the
attacker learns the difference. The fix is to stop branching on the
error type and proceed to `/auth/check` on every path.

`LoginCheck.svelte` violates a quieter form of the same contract.
Its `onSendAgain` (lines 12–26) awaits `sendMagicLink(email)` and
sets `confirmation = true` only on success — on failure the button
re-enables and nothing else happens. Same endpoint, same
endpoint-level rule (`docs/admin.md:185`: *"the same button on every
screen, with the same effect, is fine"*); current behaviour is *not*
the same effect.

Two design-handoff copy slips also need to land in the same pass:
the design canvas has the canonical wording (`design/cairn-screens.jsx:167`
and `:207-208`), `docs/admin.md:165` quotes it verbatim, but the
Svelte hasn't followed.

- `LoginRequest.svelte:103` — *"a link that signs you in"* →
  *"a link to continue"*.
- `LoginCheck.svelte:37-38` — *"Tap it on this device to sign in"*
  → *"Tap it on this device to continue"*.

`docs/development.md:230` describes the current broken state as
present tense (*"Step 3's `LoginRequest` screen surfaces the 4xx
as an inline error, so the oracle is directly visible in the UI"*)
and points at the fix as future (*"Step 13's auth-screen hardening
MUST collapse known/unknown responses…"*). Once this plan lands,
both halves of that prose contradict reality and Cairn's
pre-alpha living-docs convention says we re-cast it in past tense
(see Phase 0 below).

Sibling refinement 0301 is the relevant precedent: it shipped
`DevShortcuts.svelte` and stripped the dev-login code from the prod
bundle. The error-feedback channel that 0301 leaves intact
(`inlineError` + `errorSnack` in the parent, fed by callbacks from
the dev-only child) is what this plan deliberately keeps for the
dev shortcut while removing the magic-link path's branching into
it. The structural prod-side guarantee is unchanged: nothing in
`DevShortcuts.svelte` (and so nothing that touches `inlineError`
or `errorSnack`) ships to prod.

## Decisions

**Catch errors at the call site, don't restructure the control
flow.** The minimal change to `onSubmit` is to keep the
`try/finally`, drop the `catch` block entirely, and swallow the
rejection on the `sendMagicLink` call itself:

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
    await goto(resolve('/auth/check')).catch(() => {});
  } finally {
    sending = false;
  }
}
```

The `inlineError = null` reset stays — it clears any prior
dev-login inline error that might still be on the form when the
user switches to magic link. `sending = true` / `finally` stays
because R5 / 0301's cross-form gating depends on it. The two
`.catch(() => {})` calls are the operative lines: the first
preserves the await (so timing matches the success path) and
discards GoTrue's rejection per R1; the second restores the
safety net the original outer `catch` provided around
`goto()`, so a same-app navigation failure doesn't surface as
an unhandled promise rejection. The inline comment makes the
intent legible to a future auditor — swallowing errors silently
usually reads like a bug, and this is the unusual case where
it's the contract. (CLAUDE.md: *"Only add one when the WHY is
non-obvious"*.)

**Drop `HttpError` and `isHttpError400` from `LoginRequest.svelte`.**
After the rewrite the parent no longer needs to distinguish 4xx
from 5xx. The `HttpError` import on line 8 (paired with
`sendMagicLink`) becomes single-symbol; the `isHttpError400`
helper on lines 41–43 is dead and goes. `HttpError` stays
exported from `auth-client.ts` and stays imported by
`DevShortcuts.svelte`, `DevShortcuts.test.ts`, and the test files
for both components — only the parent component is no longer a
consumer.

**Keep `Snackbar` / `inlineError` / `errorSnack` in
`LoginRequest.svelte` for the dev-shortcut path.** Removing them
would force a refactor of `DevShortcuts.svelte` to grow its own
local error surface; the alternative (move them into the child)
splits state ownership for zero observable gain — prod doesn't
ship the child anyway. The minimal change is "stop the magic-link
submit from setting them," which is what D1 above does.

**Patch the resend the same way the submit is patched.** The
`onSendAgain` handler in `LoginCheck.svelte` becomes a one-line
change at the body of the try: append `.catch(() => {})` to the
`sendMagicLink(email)` call. The confirmation flip and the 3-second
timer arm on every path (R2). Same justification comment as the
submit. `LoginCheck.svelte` has no `goto` to guard, so the resend
needs only the single `.catch`. Considered and rejected: pre-arming
the confirmation *before* the await (which would also remove the
timing dependency on GoTrue's response). Rejected because it would
let the confirmation appear visibly faster than the spinner
finishes, diverging from the existing success behaviour and making
the state machine harder to reason about.

**Mock GoTrue with `page.route`, not a seeded banned user.**
Playwright's route interception (`page.route('**/auth/magiclink*',
route => route.fulfill({ status: 429, body: '{}' }))`) keeps the
non-2xx test hermetic and avoids per-test DB state. It exercises
the contract at the client boundary, which is exactly where the
contract lives. 429 (rate-limit) is the most realistic non-2xx —
banning happens out of band, but a real user can trip
rate-limiting by hammering the resend button.

**Phase 0 reconciles `docs/development.md:230`, not `docs/admin.md`.**
`admin.md` is the spec and already describes the post-fix state.
`development.md:230` describes the *current* state as broken and
the fix as future — both halves become wrong on merge. Phase 0
rewrites the paragraph in past tense pointing at this plan
directory; see `plans/0301_gate_dev_login/PLAN.md` § "Phase 0"
for the precedent shape.

## Architecture

### Modified files

- **`web/src/lib/auth/components/LoginRequest.svelte`** — `onSubmit`
  rewritten per the first decision above; `HttpError` import and
  `isHttpError400` helper removed; `.hint` copy per R3.
- **`web/src/lib/auth/components/LoginCheck.svelte`** —
  `onSendAgain` appends `.catch(() => {})` to the `sendMagicLink`
  call; `.body` copy per R3.
- **`web/src/lib/auth/components/LoginRequest.test.ts`** — cases
  (d), (e), (f) rewritten to assert the new contract. The mocks
  and the rest of the cases stay.
- **`web/src/lib/auth/components/LoginCheck.test.ts`** — new
  case for failure-still-confirms (R4 / R2).
- **`web/e2e/auth.spec.ts`** — second `test(...)` for the
  non-2xx route-mock (R4 / R1).
- **`docs/development.md:230`** — rewrite the paragraph in past
  tense, pointing at `plans/0302_signin_anti_enumeration/` for the
  resolved-state record (Phase 0).
- **`plans/0000_implementation_order.md:80`** — tick the `[ ]
  0302` checkbox in the close-out commit.

### New files

None.

### Files deliberately not touched

- `web/src/lib/auth/model/auth-client.ts` — `HttpError` stays
  exported; throw-on-non-2xx is correct; the UI chooses to discard.
- `web/src/lib/auth/components/DevShortcuts.svelte` and
  `DevShortcuts.test.ts` — 0301's dev-only surface keeps its 4xx
  inline / 5xx snackbar feedback channel for dev contributors
  (R5).
- `web/src/lib/auth/state/pending-login.svelte.ts` —
  `setPendingLogin` now fires on every magic-link submit including
  failures, but its semantics (store the typed address for
  `/auth/check` to read) are correct for that: the address is what
  the user typed, not what GoTrue confirmed.
- `web/src/lib/shared/components/Snackbar.svelte` — its caller
  changes; the primitive does not.
- `docs/admin.md` — the doc *is* the spec; it already describes
  the post-fix state as the contract.

### Data flow after the change

```
LoginRequest.svelte
└── onSubmit (magic-link path)
    ├── await sendMagicLink(email).catch(() => {})    ← always proceed
    ├── setPendingLogin(email)
    └── await goto('/auth/check').catch(() => {})     ← safety net for nav failure

DevShortcuts.svelte (DEV only — stripped from prod by 0301)
└── onDevLogin
    ├── 2xx           → setSignedIn → goto('/')
    ├── 4xx           → onInlineError(message)   ← parent renders inline-error div
    └── 5xx / network → onServerError()          ← parent opens snackbar

LoginCheck.svelte
└── onSendAgain
    ├── await sendMagicLink(email).catch(() => {})    ← always proceed
    └── confirmation = true (3 s)
```

The inline-error div and snackbar in the parent template stay; in
prod they're never reached (DevShortcuts is excluded by the
dynamic-import gate from 0301), in dev they're the dev contributor's
error feedback channel.

## Phase structure

RED-before-GREEN within each unit, matching the 0301 precedent.

0. **Phase 0 — reconcile `docs/development.md:230`.** Rewrite the
   anti-enumeration paragraph in past tense, pointing at this plan
   directory for the resolved-state record. The doc edit lands
   first so no in-flight commit references a stale spec. See
   Task 0.1.
1. **Phase 1 — Vitest tests (RED).** Rewrite the three error-path
   cases in `LoginRequest.test.ts` (1.1) and add the new
   confirmation-on-failure case in `LoginCheck.test.ts` (1.2).
   Both go red against the current code: the new shape of (d)/(e)/(f)
   expects absence of error UI that current code still renders, and
   the LoginCheck case expects confirmation that current code only
   sets on success. See Tasks 1.1–1.2.
2. **Phase 2 — code changes (GREEN).** Rewrite `onSubmit` in
   `LoginRequest.svelte`, strip `HttpError` import + `isHttpError400`,
   and update the `.hint` copy (2.1). Then append `.catch(() => {})`
   to `onSendAgain` in `LoginCheck.svelte` and update the `.body`
   copy (2.2). After 2.1 the Phase 1.1 cases turn green; after 2.2
   the Phase 1.2 case turns green. See Tasks 2.1–2.2.
3. **Phase 3 — Playwright + close-out.** Add the non-2xx route-mock
   test to `auth.spec.ts` (3.1). Run `./scripts/check.sh --e2e` for
   the full layer pass, then tick `[x] 0302` in
   `plans/0000_implementation_order.md:80` in a close-out commit
   (3.2). See Tasks 3.1–3.2.

## Reference docs and skills

- **`docs/admin.md`** lines 159–189 — the anti-enumeration contract
  this plan implements. Line 165 has the canonical post-submit copy;
  lines 181–185 have the three rules the contract reduces to.
- **`docs/development.md`** lines 226–235 — the *Forward-note for
  step 13 (production rollout)* / oracle paragraph. Lines 230
  describes the leak this plan closes; Phase 0 re-casts it in past
  tense.
- **`design/cairn-screens.jsx`** lines 167, 207–208 — the canonical
  UI strings; lines 295–376 — the *02b · One screen, five outcomes*
  artboard, including the *"What we deliberately never show"*
  antipattern list (lines 345–355) and the operative rule at
  364–370.
- **`docs/testing.md`** — three-layer testing convention; this plan
  touches Vitest and Playwright, no pgTAP.
- **`docs/quality.md`** — lint / type / format expectations; the
  inline comments added at the `.catch` calls must survive
  Prettier.
- **`plans/0301_gate_dev_login/`** — the format precedent. The
  phase structure (Phase 0 doc / Phase 1 RED / Phase 2 GREEN /
  Phase 3 close-out) mirrors 0301; the dev-shortcut error-feedback
  channel left intact by R5 is exactly the surface 0301 created.
- **`.claude/skills/writing-requirements.md`**,
  **`.claude/skills/writing-plan.md`**,
  **`.claude/skills/writing-tasks.md`** — the format rules these
  files follow.

## Open questions

None. The contract is documented, the design canvas has the
canonical copy, the modified-file surface is small and isolated.
