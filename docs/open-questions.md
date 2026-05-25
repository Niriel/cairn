# Open questions

Pending decisions across Cairn's design. Each bullet points at the doc
section that holds the full context — the doc carries the rationale,
this index just keeps every open thread findable from one place. When
a question is settled, delete the bullet here and revise (or remove)
the matching entry in the underlying doc.

## Avatars

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

## Admin

- **Avatar file cleanup in admin erasure.** `admin.delete_account_as`
  currently leaves the operator to run a separate `DELETE /avatars/<uid>`
  against the avatar sidecar (or rely on the nightly orphan sweep).
  A single `cairn-admin delete` subcommand that does both is obvious
  to add once the script can shell into the docker network. See
  `admin.md` § Open questions.
- **Weekly "what happened" summary.** A cron that emails the operator
  the last 7 days of `admin.actions` would catch a compromised
  operator account or a misconfiguration sooner than the current
  "remember to check" pattern. Cheap, not v1. See `admin.md` §
  Open questions.
- **Locked soft-delete for moderation.** Today `admin.moderate_item`
  is restorable from the trash by any list member — right for
  ambiguous cases, wrong for "this item is genuinely not okay." A
  future `moderate_item_locked` would use a non-tombstone sentinel
  `deleted_by` and a matching policy clause that blocks restore.
  Deferred until moderation volume justifies the second column. See
  `admin.md` § Open questions.
- **Two-person rule for `purge_*`.** A workflow where one operator
  initiates a hard-delete and a second confirms within an hour.
  Adds when there's a second operator who isn't also the first
  operator's manager. Flag column + second RPC, no architecture
  change. See `admin.md` § Open questions.
- **Self-service appeal channel for banned users.** Banned users
  currently have no in-product appeal path. They have an
  out-of-product one (email the operator), which is fine at this
  scale but isn't surfaced anywhere the sign-in screen mentions. A
  single neutral *"Account issues? Contact <address>"* link shown
  to everyone — same anti-enumeration trick at one layer of
  indirection — is the obvious shape. Blocker: GoTrue doesn't tell
  the front-end *why* a magic-link request failed, so adding a
  banned-only surface would break the indistinguishability that
  `admin.md` § "What the web app shows when a banned user tries to
  sign in" relies on. See `admin.md` § Open questions.

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
