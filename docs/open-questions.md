# Open questions

Pending decisions across Cairn's design. Each bullet points at the doc
section that holds the full context — the doc carries the rationale,
this index just keeps every open thread findable from one place. When
a question is settled, delete the bullet here and revise (or remove)
the matching entry in the underlying doc.

## Avatars

- **Sidecar implementation language.** Go vs Python vs Node. All three
  are fine; the call is "pick what the team is comfortable
  maintaining." The sidecar is well under 300 lines in any reasonable
  language. See `avatars.md` § Open questions.
- **Image format on disk.** WebP is the v1 choice (universal support
  in 2026 browsers, smallest acceptable-quality file). JPEG and AVIF
  are documented fallback paths if v1's WebP-only stance ever needs
  to flex. Re-evaluate post-v1. See `avatars.md` § Open questions.
- **Multiple sizes.** Single 256×256 is v1. A retina 512² variant at
  `/avatars/{uid}@2x.webp` is straightforward to add later — the
  version column covers both files. Deferred. See `avatars.md` §
  Open questions.

## Data export

- **Vote scope.** Option A (the user's own votes only) vs Option B
  (the user's own votes *plus* all votes on items they added).
  Recommendation **B**, on the basis that the live UI already shows
  co-members' votes on the user's items, so an export that hides them
  is paternalistic without privacy gain. Worth a deliberate call
  before the export RPC body is frozen. See `data-export.md` § "Open
  question — vote scope".

## Frontend runtime

- **CSP and the inline boot script in `app.html`.** Default: an
  inline `<script>` in `app.html` runs the FOUC-preventing theme +
  font-size reads from `localStorage` (introduced by
  `plans/0200_web_foundation` Task 1.1). No Content-Security-Policy
  is enforced by Caddy today — `architecture.md` and `deployment.md`
  make no mention of one. Trigger: when a deployment-time CSP becomes
  a requirement, migrate the boot script to either a Caddy-issued CSP
  nonce or a hashed inline script — or move the reads into a tiny
  separate JS file referenced before `%sveltekit.head%`. See
  `plans/0200_web_foundation/TASKS.md` § Task 1.1.

## Legal

- **Imprint contents.** Every legally-required field on the Imprint
  screen is currently marked with a red **Placeholder** chip:
  operator name, postal address, contact email, register number,
  responsible person under §55 RStV / §18 MStV, and so on. These
  must be filled with real values before public launch, and the
  filled imprint should get a glance from a German-speaking lawyer
  given the Hetzner-DE hosting. Launch-blocker for step 13. See
  `design/cairn-legal-screens.jsx` → L4 and `plans/0000_implementation_order.md` § step 12.

## Testing

- **Three-layer mock aggregator.** Default: no `tests/mocks/lists/`-
  style shared mock library; the co-located `__mocks__/` convention
  from `docs/frontend-layout.md` and `.claude/skills/writing-tests.md`
  is the only mock layer. Trigger: the same `vi.mock(...)`
  declarations repeating in five-plus test files. See
  `.claude/skills/writing-tests.md` § Deferred.
- **Hard coverage gate.** Default: coverage is review-enforced per
  `docs/quality.md`; no numeric threshold in CI. Trigger: a
  regression at the same component or function twice within a
  release cycle. See `.claude/skills/writing-tests.md` § Deferred.
- **happy-dom vs `@vitest/browser`.** Default: stay on happy-dom
  (the engine currently configured in `web/vitest.config.ts`).
  Trigger: a back-stack, focus, or layout test that can't be made
  deterministic under jsdom-style DOM. See
  `plans/0200_web_foundation/PLAN.md`.

## How to use this file

- **Closing a question.** Delete the bullet here, then revise (or
  delete) the matching "Open questions" entry in the doc. Add a one-
  line note in the doc if the decision deserves preservation (e.g.
  "Sidecar is Go — chosen in 2026-05 for ops familiarity").
- **Opening a question.** Add the question to the underlying doc's
  "Open questions" section (where the context lives), then add a
  bullet here pointing at that section. Don't paste the question
  text into this index — keep the rationale in one place to avoid
  drift.
- **Reading.** Use this file as a startup-of-session scan. If a
  question is here and you're about to make a related decision,
  read the underlying doc first.
