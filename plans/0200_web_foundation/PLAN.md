# Plan: Web foundation

How we land master-plan step 2: the design-token table, the theme +
font-size preferences system, the back-stack utility, and the shared
primitives every later screen reuses — plus the file-organisation and
testing conventions that keep `web/` predictable as domains accumulate.

## Context

The SvelteKit scaffold at `web/` is currently a bare skeleton — only
`src/routes/+layout.svelte`, `src/app.html`, a Vitest config, and an
MSW test harness under `src/lib/test/`. There are no components, no
tokens wired up, no theme system, and no shared primitives. Master-plan
steps 3 through 12 all reference primitives that don't exist yet: auth
screens need `TopBar` and `Button`, the MVP list view needs `Accordion`
and `Snackbar`, settings needs `Sheet`, and every screen needs theme
+ font-size to be in place at root.

The visual target is the JSX in `design/` — most notably
`design/cairn-ui.jsx`, which carries the canonical token table
(`CAIRN_LIGHT` / `CAIRN_DARK` at lines 3–33), the Lucide-derived icon
paths (`ICON_PATHS` from line 71), and the `CairnGlyph` /
`CairnWordmark` SVGs. We re-implement those screens idiomatically in
Svelte rather than porting React verbatim; the JSX is a reference, not
a source to copy.

Before any code lands, this plan also pins down **how `web/` is
organised**. That decision needs to outlive the plan: every later
domain (auth, list, avatar, settings, …) will follow the same shape,
and without writing it down, parallel sessions will diverge. The
nested per-domain layout (`components/`, `state/`, `model/`) is
modelled on the `someday` Vue codebase the maintainer is familiar
with; it translates cleanly to SvelteKit because `__mocks__/`
automock, co-located tests, and per-domain runes-state files are all
first-class in the Svelte/Vitest world.

Three constraints from `docs/` shape the work:

- **Plain CSS variables, no Tailwind.** Today the stance is implicit
  (Tailwind is simply not installed) — Phase 0 makes it explicit by
  appending a paragraph to `docs/architecture.md` "Considered and
  rejected". Tokens are CSS custom properties; component styles are
  scoped `<style>` blocks consuming `var(--...)`.
- **Safe-area and viewport handling are non-negotiable**
  (`docs/ui.md:119-135`): `viewport-fit=cover`, `env(safe-area-inset-*)`,
  `100dvh`. The FAB and snackbar must never overlap system chrome.
- **Back stack is the source of truth** (`docs/ui.md:137-153`): the
  in-app **←**, system back, swipe back, and the desktop back button
  must all do the same thing. Every dismissible overlay pushes
  history on open and listens for `popstate` to close. Vitest must
  assert this for at least one overlay primitive.

## Decisions

**Nested per-domain layout, not flat.** Each domain folder has
`components/`, `state/`, `model/`, optionally `views/`. Flat is
simpler at the start, but path-baking has asymmetric cost: starting
flat and migrating later means a search-and-replace across every
import, test, and mock; starting nested costs almost nothing today
(a few extra folders) and accommodates growth without churn. The Vue
codebase the maintainer already lives in uses this layout, and the
runes-vs-components distinction in Svelte 5 is mentally similar to
Vue's components-vs-composables split even though the syntax is
closer. (R1, R2)

**Hybrid mock placement: `__mocks__/` folders + inline factories.**
Vitest's `vi.mock(path)` automock — picking up
`__mocks__/<name>.svelte` next to the source — is engine-level, not
Vue-specific. It carries the same single-source-of-truth benefit the
maintainer's `someday` codebase gets, while inline factory mocks
remain available for one-offs. The Vue-faithful option (every
component gets a mock file, always) was rejected as boilerplate; the
Svelte-idiomatic option (no `__mocks__/` folders, inline only) was
rejected because tests that mock the same child component repeatedly
end up duplicating stubs. (R4)

**Cherry-picked testing rules.** From `someday`'s two testing
skills we adopt: `data-test` attributes (never CSS classes), no
shared `beforeEach`, one mock file per source, MSW at the network
layer. We defer: the three-layer mock aggregator
(`tests/mocks/lists/`) and a hard 100% coverage gate. Cairn is
pre-alpha and the gates would cost more in friction than they buy
right now; both are logged in `docs/open-questions.md` so the
decision is findable when we revisit. The cherry-picked rules ship
as a Cairn testing skill that points at `docs/testing.md` for the
layer split rather than duplicating it. (R5, R14)

**Theme via `data-theme` attribute on `<html>`, not a class.**
`document.documentElement.dataset.theme` is set by
`preferences.svelte.ts` and matched by attribute selectors in
`tokens.css`. The `'system'` case is the default and falls through
to `prefers-color-scheme`, so an unloaded preferences module still
produces the right colours on first paint. A class-based toggle
(`.dark` on body) was rejected because it makes the
`'system' → prefers-color-scheme` fallback harder to express
declaratively. (R7)

**Font-size scale as a single CSS variable on `:root`.** Five steps
(XS/S/M/L/XL), mapping to factors `0.85 / 0.92 / 1.0 / 1.1 / 1.22`,
applied via `:root { font-size: calc(16px * var(--font-size-scale)); }`.
Every component uses `rem`, so a single variable change rescales the
entire UI. Alternatives like five separate type-size variables
(`--font-size-body`, `--font-size-title`, …) were rejected because
they couple every component to a centralised type-system and make
adding a new size painful. (R8)

**Self-hosted fonts via `@fontsource-variable/*`.** No external CDN
(no-hyperscalers constraint, `docs/architecture.md` "Considered and
rejected"). The variable packages give the full weight range from a
single woff2 download, keeping payload small. (R9)

**back-stack as a small utility, not a framework.**
`pushHistoryGuard(onPop)` is the entire API: pushes a marker, listens
for `popstate`, returns a cleanup that pops the marker if the overlay
closes for non-back reasons. Built-in to Sheet unconditionally;
opted-in via a mandatory prop on Accordion (see below); transient
surfaces (Snackbar) deliberately do not call it. A heavier "overlay
manager" with z-index stacking and focus trapping was considered and
rejected: the primitives that need those concerns can implement them
when they're built, and a generic manager risks over-fitting to
today's two consumers. (R11)

**Accordion has a mandatory `pushesHistory` prop, no default.** The
docs describe two accordion-ish patterns: the items-screen item panel
(one-at-a-time, listed at `docs/ui.md:146` as a dismissible overlay
that pushes history) and the lists-screen list-description expand
(`docs/ui.md:33`, where *multiple* expansions are allowed
simultaneously). A single primitive serving both shapes can't quietly
default — defaulting to `true` would silently break list descriptions
(one back press collapsing all open ones); defaulting to `false`
would silently break the items canary. Making the prop required and
unset-by-default forces every caller to make the decision deliberately.
TypeScript marks it required so a caller who forgets it fails
type-check. A split into two primitives (`OverlayAccordion` /
`InlineAccordion`) was considered and rejected as premature — we have
zero consumers in this plan; step 4 ships the first one, and if the
two shapes drift further apart then the split happens then. (R11, R13)

## Architecture

### New files

**Conventions & docs (lands first in Phase 0):**
- **`docs/frontend-layout.md`** — living spec for R1–R5 (per-domain
  shape, three-tier split, filename rules, mock placement, testing
  rules). Worked example: "Adding a new domain."
- **`.claude/skills/writing-tests.md`** — Cairn testing skill
  codifying R5. Lives in `.claude/skills/` alongside the existing
  `writing-plan.md` / `writing-requirements.md` / `writing-tasks.md`
  / `writing-sql.md` family (not `.claude/commands/`, which is for
  slash commands).

**Web source — global infrastructure:**
- `web/src/lib/test/render.ts` — wraps `@testing-library/svelte`
  render; exports `getByDataTest(name)`.
- `web/src/lib/shared/styles/tokens.css` — CSS custom properties
  lifted from `design/cairn-ui.jsx:3-33`.
- `web/src/lib/shared/styles/reset.css` — minimal modern reset.
- `web/src/lib/shared/styles/typography.css` — `@fontsource-variable`
  imports, `--font-size-scale` plumbing.
- `web/src/lib/shared/model/safe-area.ts` — named constants for
  `env(safe-area-inset-*)`.
- `web/src/lib/shared/state/preferences.svelte.ts` — theme +
  font-size runes module.
- `web/src/lib/shared/state/back-stack.svelte.ts` — `pushHistoryGuard`
  utility.

**Web source — primitives** (each with `.test.ts` and, where used
from more than one test, a `__mocks__/` counterpart):
- `web/src/lib/basic/model/icon-paths.ts`
- `web/src/lib/basic/components/Icon.svelte`
- `web/src/lib/basic/components/Button.svelte`
- `web/src/lib/basic/components/Fab.svelte`
- `web/src/lib/basic/components/Sheet.svelte`
- `web/src/lib/shared/components/CairnGlyph.svelte`
- `web/src/lib/shared/components/CairnWordmark.svelte`
- `web/src/lib/shared/components/TopBar.svelte`
- `web/src/lib/shared/components/ButtonPair.svelte`
- `web/src/lib/shared/components/Snackbar.svelte`
- `web/src/lib/shared/components/Accordion.svelte`

### Modified files

- **`web/src/app.html`** — `viewport-fit=cover` on the viewport meta;
  `<html>` height `100dvh`.
- **`web/src/routes/+layout.svelte`** — import `tokens.css`,
  `reset.css`, `typography.css`; mount `preferences.svelte.ts` so its
  `$effect` runs and sets `data-theme` / `--font-size-scale` on
  `:root`.
- **`web/package.json`** — add `@testing-library/svelte`,
  `@fontsource-variable/newsreader`,
  `@fontsource-variable/jetbrains-mono`.
- **`CLAUDE.md`** — insert `docs/frontend-layout.md` into the
  **Read first** ordered list between `docs/data-model.md` and
  `docs/testing.md`.
- **`docs/testing.md`** — one-paragraph cross-reference pointing at
  `docs/frontend-layout.md` (layout) and the new testing skill (rules).
- **`docs/open-questions.md`** — log three deferred decisions: the
  three-layer mock aggregator, the hard coverage gate, and the
  jsdom-vs-`@vitest/browser` choice.
- **`docs/architecture.md`** — append one paragraph to "Considered
  and rejected" pinning down the no-Tailwind / no-utility-class-CSS
  stance, so `PLAN.md`'s citation is real rather than implicit.

### Dependency graph between primitives

```
back-stack.svelte.ts ────────┬──> Sheet.svelte ──> (consumers in step 3+)
                             │
                             └──> Accordion.svelte ──> (canary test)

preferences.svelte.ts ──> +layout.svelte ──> data-theme on <html>
                                          ──> --font-size-scale on :root

icon-paths.ts ──> Icon.svelte ──> Button.svelte
                              ──> TopBar.svelte (back arrow)
                              ──> Snackbar.svelte (close X)
                              ──> Fab.svelte (slot consumer; icon optional)

CairnGlyph.svelte ──> CairnWordmark.svelte ──> TopBar.svelte title slot
```

`Sheet` and `Accordion` are the only consumers of `back-stack` in
this plan; later steps add more. `TopBar`, `ButtonPair`, and `Snackbar`
depend on `Button` and `Icon` from `basic/`. The vote indicator (out
of scope, master-plan step 4) will depend on `Icon` and the JetBrains
Mono font wired up here.

## Phase structure

Phases are ordered so each layer's prerequisites are landed before
the layer that consumes them. RED tests are written before the GREEN
implementation in every task that produces testable logic
(`.claude/skills/writing-tasks.md`).

0. **Phase 0 — Docs & conventions.** Land `docs/frontend-layout.md`,
   the testing skill, the CLAUDE.md edit, the `docs/testing.md`
   cross-reference, the `docs/architecture.md` styling-stance
   addendum, and the `docs/open-questions.md` updates **before** any
   code. Downstream tasks reference these docs from their
   `Reference:` lines; landing them first means the convention is
   canonical when components start being written, not retrofitted.
   See Tasks 0.1–0.4.

1. **Phase 1 — Scaffold and test harness.** Package deps
   (`@testing-library/svelte`, `@fontsource-variable/*`), the
   `web/src/lib/test/render.ts` helper with `getByDataTest`, and the
   `app.html` updates (`viewport-fit=cover`, `100dvh`). After this
   phase, components can be written and tested in the conventional
   way. See Tasks 1.1–1.3.

2. **Phase 2 — Design tokens, theme, typography.** Lift tokens into
   `tokens.css`; wire `reset.css` and `typography.css`; create
   `safe-area.ts`; implement `preferences.svelte.ts` with RED tests
   first (localStorage round-trip, attribute-on-`<html>` effect,
   font-size scale variable). Mount preferences in `+layout.svelte`
   so the system attribute is set on first paint. See Tasks 2.1–2.4.

3. **Phase 3 — Basic primitives and back-stack.** `Icon`, `Button`,
   `Fab`, then the back-stack utility, then `Sheet` which consumes
   it. RED-then-GREEN per primitive. See Tasks 3.1–3.5.

4. **Phase 4 — Shared primitives.** Wordmark/glyph,
   `TopBar` (back-arrow → `history.back()`), `ButtonPair`,
   `Snackbar` (explicitly **does not** push history),
   `Accordion` (with the back-stack canary assertion required by R11
   and the master-plan step 2 description). See Tasks 4.1–4.5.

## Reference docs and skills

- **`docs/architecture.md`** — runtime topology, the no-hyperscalers
  constraint, the SvelteKit static-bundle choice; constrains the
  font-hosting decision and rules out Tailwind.
- **`docs/ui.md`** — safe-area handling (lines 119–135), back-stack
  pattern (137–153), font-size scale (163–166), theme is device-local
  (161–168). The canonical source for every primitive's behaviour.
- **`docs/testing.md`** — the three-layer pyramid (pgTAP / Vitest /
  Playwright) the testing skill points at.
- **`docs/quality.md`** — Prettier/ESLint/svelte-check own formatting
  and types; no hand-formatting against the formatter.
- **`design/cairn-ui.jsx`** — token tables (3–33), icon paths (71+),
  glyph / wordmark SVGs (38–67). Source-of-truth for the visual
  layer.
- **`.claude/skills/writing-tasks.md`** — TDD ordering, self-contained
  task briefings.
- **`.claude/skills/writing-plan.md`** — the format this file follows.

## Open questions

- **`docs/frontend-layout.md` placement in the Read-first list.** The
  plan inserts it between data-model and testing; if the maintainer
  prefers a different slot (e.g. before ui.md, since layout precedes
  individual UI patterns), adjust in Task 0.1.
- **Skills location.** The plan assumes `.claude/skills/` matches the
  existing `work` / `write-plan` skills' home. Task 0.2 verifies the
  exact path before writing.
- **`happy-dom` vs `@vitest/browser` + Playwright provider.** Logged in
  `docs/open-questions.md`. Stays on `happy-dom` for this step;
  revisit if a primitive's DOM behaviour proves flaky.
- **Whether `CairnGlyph` / `CairnWordmark` belong in `basic/` or
  `shared/`.** Currently in `shared/` because they're Cairn-branded.
  If a later refactor introduces a generic logo primitive, the glyph
  can stay in `shared/` (Cairn-specific) and a `basic/Logo.svelte`
  could host the size/colour wiring. Out of scope here.
