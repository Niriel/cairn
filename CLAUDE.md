# Cairn

You are working on **Cairn**, a SvelteKit Progressive Web App for
collaborative ranked lists, backed by a self-hosted Postgres + PostgREST +
GoTrue stack on a Hetzner VPS. (We use the Supabase open-source components,
not Supabase's hosted service — the no-hyperscalers constraint rules out the
latter; see `docs/architecture.md` "Considered and rejected".) The full
specification is in `docs/`, with visual references in `design/`.

## Read first

1. `docs/README.md` — overview and reading order
2. `docs/architecture.md` — runtime topology (SvelteKit PWA + self-hosted Postgres/PostgREST/GoTrue on Hetzner)
3. `docs/data-model.md` — schema, RLS, triggers, views
4. `docs/frontend-layout.md` — `web/src/lib/` tier split (`basic/`, `shared/`, per-domain), filename rules, mock placement
5. `docs/testing.md` — three test layers (pgTAP, Vitest, Playwright); pgTAP is load-bearing because RLS is the security boundary
6. `docs/quality.md` — lint/format/type-check toolchain (ESLint, Prettier, svelte-check, SQLFluff, ShellCheck, shfmt, lefthook)
7. The doc most relevant to whatever you're being asked to build

## Where we are in the build

`plans/0000_implementation_order.md` is the master roadmap: a numbered
list of the thirteen plans that take Cairn from walking-skeleton to
production. Each item is a checkbox — `[ ]` means to do, `[x]` means
done. **Read it at the start of any session** to know which step is
current and what has shipped. Detailed sub-plans live alongside it
as three-file directories (`plans/0010_db_foundation/`,
`plans/0200_<slug>/`, `plans/0300_<slug>/`, …, `plans/1300_<slug>/` —
see `.claude/commands/write-plan.md` for the numbering and file-format
conventions); tick the box in `0000_…` once the matching sub-plan is
merged.

Cairn is **pre-alpha**. The docs in `docs/` are living
specifications, not holy tablets — when a plan finds a better
design than the doc describes, the right move is often to update
the doc (sometimes via a Phase 0 in the plan) rather than to wedge
a contradiction into the plan. As more of the spec lands in code,
doc edits increasingly imply code/migration/test edits too —
something purely descriptive today may be load-bearing tomorrow.
Use judgement, and prefer the cheapest home for a fix.

## Visual reference

`design/Cairn - Design Canvas.html` (open in a browser to see every screen —
high-fidelity mockups in iOS/Android, light/dark). The JSX in `design/` is a
visual and structural reference — re-implement screens idiomatically in
Svelte rather than porting React verbatim. Design tokens (`CAIRN_LIGHT` /
`CAIRN_DARK` in `design/cairn-ui.jsx`) can be lifted directly.

## Conventions

- Soft-delete by default (see `docs/data-model.md`).
- User-facing text is **British English** (colour, organise, behaviour,
  realise, …). Code, identifiers, comments, commit messages, and docs
  stay US English — that's the lingua franca for programming. The split
  is: anything a user reads on screen → British; anything a developer
  reads in source → US.
- In user-facing text, the word is **"e-mail" / "E-mail"**, hyphenated.
  Code identifiers (prop names, variables, JSON fields, env vars,
  classes, test selectors, URL params) stay `email` — they're the
  programming-side spelling and changing them would churn the codebase
  for no user-visible gain.
- User-facing text uses **"they / them / their"** as the default
  pronoun, including when referring to demo characters with gendered
  names like Bob or Carol. Gender-neutral by default — never assume.
  Proper nouns that contain a gendered pronoun (e.g. film titles like
  *His Girl Friday*) stay as written. Same code/UI split as above:
  this rule is about rendered copy, not code.
- E-mail addresses are private — never shown in the UI (see `docs/invites.md`).
- Button pairs: right is forward/committal, left is backward/destructive
  (see `docs/ui.md` → "Button order in pairs").
- The circle model is one-directional and invisible to the other side
  (see `docs/circles.md`).
- Avatars are filesystem files at `/srv/cairn/avatars/{uid}.webp`, served
  by Caddy, with a tiny integer `profiles.avatar_version` as cache
  buster — `0` = no picture, render initials (see `docs/avatars.md`).
- Server logs are short by design: no request bodies, no query strings,
  email hashes only, no third-party telemetry (see `docs/logging.md`).
- Currently-unresolved decisions across docs are indexed in
  `docs/open-questions.md` — start there before opening a new question
  to avoid duplication.
- Guiding principle: the simplest thing that works, with attribution and
  undo built in (see `docs/architecture.md`).

## Tests and quality (non-negotiable)

- Every change to schema, RLS policy, trigger, or view ships with a
  pgTAP test in `db/tests/`. Positive **and** negative cases for any
  new policy. RLS is the security boundary; an untested policy is an
  unverified claim. See `docs/testing.md`.
- New `src/lib/` functions and Svelte components ship with Vitest tests.
  Component tests assert user-visible behaviour, not internals.
- New user-visible flows get a Playwright touch under `web/e2e/`.
- Before marking a task done, run `./scripts/check.sh` (or the
  individual `pnpm check` / `pnpm lint` / `pnpm test` / `./scripts/test-db.sh`
  commands). If the change touches user-visible flows, run
  `./scripts/check.sh --e2e` (or `cd web && pnpm test:e2e`) before
  opening a PR. If you can't run them, say so explicitly — don't claim
  success on the basis of "it should work."
- Don't disable a lint rule, type check, or RLS policy to get a change
  through. The rule is right or the code is wrong; figure out which.
  Per-line `// eslint-disable-next-line` or SQL `-- noqa:` is fine when
  justified by a comment; global disables are not.

## Style

- Commit messages: always include a domain in parentheses —
  `feat(calendar):`, `fix(sync):`, `chore(css):`, never bare `feat:` or
  `fix:`.
- Code style is owned by Prettier (TS/Svelte/CSS/JSON/MD), SQLFluff
  (SQL), and shfmt (shell). Don't hand-format against them — run the
  formatter. See `docs/quality.md`.
