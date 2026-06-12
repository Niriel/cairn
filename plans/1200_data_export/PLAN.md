# Plan: Data export (GDPR portability)

Step 12 of `plans/0000_implementation_order.md`: a single `security
definer` RPC returns the caller's whole world as JSON, and the web app
turns that JSON into a downloadable ZIP assembled in the browser tab.
This work exists to satisfy the GDPR data-portability right and ships
the "Download my data" surface designed in `design/cairn-export-screens.jsx`.

## Context

Everything this depends on already shipped. The data model
(`profiles`, `user_settings`, `lists`, `list_members`, `items`, `votes`,
`relationships`, `invitations`, the tombstone user, `public.uid()`)
landed across migrations 0004–0017. The most recent migration, `0017_admin.sql`,
contains the **exact template** for this RPC: `admin.inspect_user`
(`0017_admin.sql:185`) assembles a per-user JSONB document with
`jsonb_build_object` over nested subqueries and an **allowlist** `auth`
sub-document — never `to_jsonb(u)` minus secrets — and `db/tests/admin_inspect.sql`
is the matching pgTAP template that seeds sentinel secrets and proves the
allowlist holds. `public.delete_account()` (`0014`) supplies the guard
pattern this RPC mirrors (NULL uid → `28000`; tombstone → reject).

On the web side, the PostgREST wrapper `pgPost`
(`web/src/lib/shared/http/postgrest.ts`) is how we call the RPC; the
Settings screen already has a clean section/`NavRow` pattern to extend
(`web/src/lib/settings/components/SettingsScreen.svelte`); and the
Delete-account screen **already carries a disabled
`delete-account-export-download` button with an explicit `TODO(step-12)`**
waiting for this plan to wire it
(`web/src/lib/account/components/DeleteAccountScreen.svelte:73-89`).
`web/` has essentially no runtime dependencies today (two fontsource
packages), so adding `jszip` is a deliberate, isolated addition.

The spec is `docs/data-export.md` — the headline rule is "a personal
archive, not a backup", and the doc's § "Build order" prescribes the
phasing this plan follows (RPC → Settings row + raw JSON → HTML+ZIP →
avatar embeds → delete-account panel), so each phase is independently
shippable and the smallest slice (Phase 1 + the JSON download) already
satisfies the legal requirement.

Two decisions were taken with the user before planning (2026-06-12):
vote scope is **Option B**, and the ZIP is produced with **`jszip`**.
Both are recorded below.

## Decisions

**Copy `inspect_user`, not `to_jsonb` minus secrets (R4).** The `user`
block is an explicit allowlist of columns, so a future GoTrue column can
never silently leak into a user's archive. The migration body and the
pgTAP test are both modelled directly on `0017_admin.sql` /
`admin_inspect.sql` — including seeding sentinel values into every
credential/recovery-token column and asserting each is absent. This is
the single most important correctness property of the RPC, and the
template already exists; we reuse it rather than reinvent it.

**Vote scope is Option B (R3).** `docs/data-export.md` flagged this as an
open question (also indexed in `docs/open-questions.md`). The user chose
Option B: items the caller added carry an `all_votes` array of every
co-member's vote value, by display name. Rationale (from the doc):
the live UI already shows the item author these values, so an export
that hides them is paternalistic without privacy gain. Because this
freezes a documented open question, it lands as a Phase 0 doc edit
(see below) before the RPC body that depends on it.

**Co-member avatars need no UUID plumbing beyond the JSON (R9).**
`data.json` already carries member and creator `id`s. The client
best-effort fetches `/avatars/{uid}.webp` for each distinct co-member id
and the caller, and skips on any non-200. `avatar_version` (a cache
buster) is irrelevant to a one-shot fetch and a user with no picture
simply 404s, so the RPC need not return version numbers — keeping the
RPC and the JSON shape exactly as `data-export.md` documents.

**One route, three states (R7).** The hub/packaging/ready artboards are
phases of one client-side state machine (`idle → packaging → ready |
error`), not separate routes. This keeps back/refresh semantics simple
and ties the in-tab archive's lifetime to the screen, not to navigation
history. The state lives in a `.svelte.ts` runes module so it is unit
testable independent of the component.

**HTML rendered in TS, no JS in the output (R8).** `data.html` and the
two READMEs are built as static strings from the canonical JSON in pure
functions (`export/model/render-html.ts`), which makes them trivial to
unit test and guarantees the archive contains no executable code — it
opens in any browser, offline, indefinitely.

**`jszip` over a hand-rolled encoder (R8).** A portability/privacy
feature must emit valid archives; `jszip` is battle-tested and removes
CRC32/central-directory correctness from our surface area. The cost is
one ~100 KB runtime dependency, accepted by the user.

**Phasing follows the doc's build order.** Each phase greens
independently. Phase 1 (RPC) + the raw-JSON download in Phase 2 is the
minimum that satisfies GDPR portability; Phases 3–5 are product polish.

## Architecture

### New files

- **`db/migrations/0018_data_export.sql`** — `public.export_my_data()`
  and its grant/revoke, in a single `BEGIN; … COMMIT;`.
- **`db/tests/export_my_data.sql`** — pgTAP coverage for R5.
- **`web/src/lib/export/model/types.ts`** — TS types mirroring the JSON
  document (`ExportDocument`, `ExportList`, `ExportItem`, `ExportVote`, …).
- **`web/src/lib/export/model/render-html.ts`** (+ `.test.ts`) —
  `renderDataHtml(doc)`, `renderReadmeHtml(doc)`, `renderReadmeMarkdown(doc)`,
  all pure, all JS-free output.
- **`web/src/lib/export/model/archive.ts`** (+ `.test.ts`) —
  `exportFileName(doc)` → `cairn-export-{yyyymmdd}-{shortid}.zip` and
  `buildArchive(doc, avatars)` → `Blob` using `jszip`.
- **`web/src/lib/export/state/export.svelte.ts`** (+ `.test.ts`) — the
  state machine: `status`, `result`, `error`, and `prepare()` (calls
  `pgPost('/rpc/export_my_data', {})`, fetches avatars, builds the
  archive), `download()`, `reset()`.
- **`web/src/lib/export/components/ExportHubScreen.svelte`** (+ `.test.ts`)
  — the three-state hub (R7).
- **`web/src/routes/(app)/settings/data-export/+page.svelte`**
  (+ `page.test.ts` — route-test filename drops the `+`) — thin wrapper
  that renders `ExportHubScreen`.
- **`web/e2e/export.spec.ts`** — Playwright happy path.

### Modified files

- **`web/src/lib/settings/components/SettingsScreen.svelte`**
  (+ `SettingsScreen.test.ts`) — add the "Privacy & data" section and
  "Download my data" `NavRow` (R6).
- **`web/src/lib/account/components/DeleteAccountScreen.svelte`**
  (+ `DeleteAccountScreen.test.ts`) — enable the export button, navigate
  to `/settings/data-export`, drop `disabled` + the `TODO` (R10).
- **`web/package.json`** — add `jszip` to `dependencies`.
- **`docs/data-export.md`** — rewrite § "Open question — vote scope" to
  record Option B as decided (Phase 0).
- **`docs/open-questions.md`** — delete the "Data export → Vote scope"
  bullet (Phase 0).

### Layering

The new domain lives under `web/src/lib/export/` per
`docs/frontend-layout.md`: `model/` for plain-TS types/renderers/archive,
`state/` for the `.svelte.ts` machine, `components/` for the screen. It
imports only from `basic/` and `shared/`, never sibling domains.

## Phase structure

TDD throughout: pgTAP/Vitest red before the implementation that greens
it, within each task.

0. **Phase 0 — reconcile docs.** Freeze the vote-scope open question to
   Option B: rewrite `docs/data-export.md` § "Open question — vote scope"
   to state the decision and its rationale, and delete the matching
   bullet in `docs/open-questions.md`. Lands first so the spec the
   pgTAP test references is correct (R3).

1. **Phase 1 — RPC + pgTAP (R1–R5).** Write `db/tests/export_my_data.sql`
   red (per-user scoping, Option-B `all_votes`, allowlist secret-strip
   with seeded sentinels, no co-member email, both guards, grant matrix)
   against the `list_shared_alice_bob` fixture plus seeded
   votes/relationships/invitations; then green it with
   `0018_data_export.sql` modelled on `inspect_user`. Satisfies GDPR
   portability at the data layer.

2. **Phase 2 — Settings row + raw-JSON download (R6, smallest UI slice).**
   Add the "Privacy & data" section and `NavRow`; add the route and a
   minimal `ExportHubScreen` whose "Prepare" calls the RPC and downloads
   `data.json` directly (no ZIP, no HTML yet). Plus the `export.svelte.ts`
   machine's RPC call and `types.ts`. Vitest on the row and the machine.

3. **Phase 3 — HTML + README + ZIP (R7, R8).** Add `jszip`; implement
   `render-html.ts` and `archive.ts`; flesh `ExportHubScreen` into the
   three-state flow with the filename chip. Vitest on the renderers
   (JS-free output, JSON-path links), the archive (open the produced
   Blob, assert entry names/contents), and the hub states.

4. **Phase 4 — avatar embeds (R9).** In `prepare()`, best-effort fetch
   the caller's avatar → `avatar.webp` and co-member avatars →
   `avatars/{uid}.webp`; omit on any non-200. Vitest with mocked `fetch`
   (present / 404 / network error).

5. **Phase 5 — delete-account panel + e2e (R10).** Wire the existing
   button and update `DeleteAccountScreen.test.ts`. Add
   `web/e2e/export.spec.ts`: Mailpit sign-in → Settings → Download my
   data → Prepare → Ready → capture the browser download and assert a
   valid ZIP with the expected entries; plus Delete account → "Download"
   → `/settings/data-export`.

## Reference docs and skills

- **`docs/data-export.md`** — the spec: included/excluded data, the
  `data.json` shape, the ZIP format, the screen flow, the build order.
- **`docs/ui.md`** — Settings layout, TopBar, empty/progress states,
  "layout local, visual global" CSS rule.
- **`docs/frontend-layout.md`** — the `export/` domain's `model/`/`state/`/
  `components/` split and filename rules (route tests drop the `+`).
- **`docs/avatars.md`** — the `/avatars/{uid}.webp` URL and the
  `avatar_version` cache-buster (why R9 can skip version plumbing).
- **`docs/invites.md`** — the email-is-private contract R4 upholds.
- **`db/migrations/0017_admin.sql` + `db/tests/admin_inspect.sql`** — the
  RPC and allowlist-pgTAP templates to copy.
- **`.claude/skills/writing-*.md`** — plan-file format.
