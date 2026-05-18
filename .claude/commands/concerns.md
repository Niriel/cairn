---
description: Audit the current branch's plan for problems, then walk through fixing them
---

Audit the plan that matches the current branch. If `CONCERNS.md`
doesn't exist, do a fresh audit and write one. If it does, summarise
what's outstanding and resume the resolution loop.

## Step 1 — Locate the plan

Run `git rev-parse --abbrev-ref HEAD` to get the branch name. The
plan lives at `plans/<branch>/` as a directory of three files:
`REQUIREMENTS.md`, `PLAN.md`, `TASKS.md` (the convention enforced
by `/write-plan`). If the directory doesn't exist, tell the user
(they may not have run `/write-plan` yet, or the branch doesn't
correspond to a plan) and stop.

## Step 2 — Audit phase or Resolution phase?

`CONCERNS.md` lives inside the plan directory —
`plans/<branch>/CONCERNS.md` — so each branch carries its own
concerns file alongside the plan it audits.

- `CONCERNS.md` does **not** exist → run the **Audit phase** below.
- `CONCERNS.md` exists → skip to **Resolution phase**.

`CONCERNS.md` is a scratch artefact, never the system of record —
all resolutions land in the plan files (or `docs/*.md`).

## Audit phase

### Read

Read everything in the plan directory (`REQUIREMENTS.md`,
`PLAN.md`, `TASKS.md`). Then read:

- `.claude/skills/writing-requirements.md`,
  `.claude/skills/writing-plan.md`,
  `.claude/skills/writing-tasks.md` — what good plan files look
  like; deviations from these conventions are fair game.
- The `docs/*.md` files the plan references — to spot divergences.
- The actual source files the plan claims to modify — don't review
  in the abstract; check types, function signatures, existing
  behaviour, and callers against what the plan claims.

### What to look for

Use your judgement — anything that would slow down, mislead, or
burn an executor is fair game. The categories below are *examples*,
not a closed checklist; raise whatever you spot that doesn't fit
them.

**Security and privacy concerns are top priority** — look for them
first, and when present they belong at the top of the gravity
ordering (above contradictions, doc divergence, etc.). They're easy
to introduce in subtle ways and expensive to unbreak after the
fact, so a thin one is still worth raising.

- **Security vulnerabilities** — anything that could let a caller
  see or mutate data they shouldn't, or that widens the attack
  surface. Examples to scan for, not exhaustive: missing/weak
  authorization checks (in Cairn that's usually RLS — but also
  RPCs, triggers, views), `SECURITY DEFINER` functions without a
  locked-down `search_path`, policy/grant matrices that hand
  verbs to roles that shouldn't have them, policy/trigger
  interactions that let clients spoof attribution, missing
  identity re-checks inside RPCs, trust placed in unsigned or
  unvalidated input (JWT claims, request bodies, env vars),
  injection vectors (SQL, command, template) in migrations or
  scripts, secrets committed to the repo, side-channels (timing,
  error-message oracles, status-code differences), and tests
  that only prove the positive case when the policy *is* the
  boundary.
- **Privacy issues** — anything that risks leaking personal data
  or violating the project's privacy contract as expressed in
  `docs/`. Examples: fields surfaced in UI/API/logs that the docs
  say must stay private, joins or views that expose one user's
  relationships to another, error messages or status codes that
  act as enumeration oracles, soft-deleted or tombstoned data
  reachable from the wrong path, telemetry or analytics fields
  that capture identifiable content, and any path where a deleted
  user's data persists past the contract in
  `docs/account-deletion.md`. The docs (especially
  `docs/invites.md`, `docs/circles.md`,
  `docs/account-deletion.md`) are the source of truth for what
  counts as private — read them before deciding whether a thing
  is a leak.
- **Contradictions** — two parts of the plan that disagree, or
  TASKS.md steps that don't match the Decisions in the same task
  block, or REQUIREMENTS.md that the plan's own Architecture
  contradicts.
- **Unclear instructions** — places in TASKS.md where an
  executor would have to guess. Tasks must be self-contained per
  `.claude/skills/writing-tasks.md`; if a task is unreadable
  without `PLAN.md` open, that's a concern.
- **Foreseeable bugs** — code patterns the plan implies that you
  can already tell will fail: ordering issues, race conditions,
  silent failures, missing error paths at boundaries,
  contradictory invariants.
- **Missing tests** — features the plan adds without
  corresponding test coverage, given the project's TDD stance.
  RLS policies without paired pgTAP tests (positive *and*
  negative) are always a concern.
- **TDD violations** — places in `TASKS.md` where green steps
  would land before red.
- **Forgotten dependencies** — files/configs/scripts the plan
  needs to touch but doesn't list in any task's **Files**.
- **Tests out of sync** — when a task modifies a source file, a
  matching test file must be updated in the same task. Function
  signature, type, or behaviour changes must account for every
  test file exercising that code.
- **Doc divergence** — places where the plan diverges from
  `docs/*.md` without a Phase 0 to reconcile them. Cairn is
  pre-alpha; `docs/*.md` are still living specifications, not
  frozen prose. When a plan's design choice is *better* than the
  doc, the right fix is often to **edit the doc** (or add a
  *Phase 0* to the plan that edits the doc as its first step)
  rather than to wedge a contradiction. As the codebase grows,
  more of what the docs describe is already implemented in code
  — changing a doc then implies changing code, migrations, or
  tests too. Use judgement: a doc-only edit is cheap when the
  doc is purely descriptive of an unbuilt area, expensive when
  the described thing is already shipped.
- **UX concerns** — interactions that violate the principle of
  least surprise (unexpected behaviour, hidden state changes,
  silent failures), missing or unclear feedback, awkward flows
  (too many clicks, dead ends), missing affordances, destructive
  actions without confirmation or undo, edge cases the user will
  hit in normal usage (empty states, long text, rapid clicks).
- **Code smell / unusual practices** — patterns the plan implies
  that work but a seasoned practitioner of the language,
  framework, or tool would flag: fighting the framework,
  reinventing a built-in, idioms that read fine to a generalist
  but a specialist would call out as non-idiomatic. The user is
  not always able to spot these themselves and is counting on
  you to know what good looks like in the relevant ecosystem
  (SvelteKit, Postgres, PostgREST, GoTrue, pgTAP, ESLint, etc.)
  and call it out.
- **Toolchain coupling across tasks** — places where the order
  of tasks fights the type checker or linter, even when the
  runtime behaviour is fine. The canonical Cairn case: a task
  navigates with `goto('/foo')` while the `/foo/+page.svelte`
  is created by a later task. SvelteKit's generated route-id
  union doesn't include `/foo` until the route exists, so
  `resolve('/foo')` fails type-check, and `svelte/no-navigation-
  without-resolve` blocks the bare string. Similar shapes:
  importing a type/symbol from a module created later in the
  plan, RLS tests written against a column added in a later
  migration, a Playwright spec asserting a route mounted by a
  later task. The cost is real — the executor either bends a
  lint rule mid-task or stops to renumber. Flag any cross-task
  reference where the producer task is downstream of the
  consumer task. See `docs/quality.md` "Navigating to a
  not-yet-created SvelteKit route" for the documented workaround
  when reordering isn't worth it; in any case, the plan should
  pre-decide which side absorbs the cost rather than leaving
  the executor to discover it.
- **Anything else** — scope creep, unrealistic estimates, missed
  rollback paths, performance traps, etc.

### Write `CONCERNS.md`

Write to `plans/<branch>/CONCERNS.md`. **Group concerns into
sections by area** with `##` headings, and order both the
sections and the concerns within each section by gravity.
`## Security/privacy` (when non-empty) is always first; the
remaining sections follow in gravity order, with small
clarifications and typos at the bottom. Pick section names that
fit what you actually found — examples: `## Security/privacy`,
`## Contradictions`, `## Foreseeable bugs`, `## Missing tests`,
`## Doc divergence`, `## UX`, `## Code smell`,
`## Clarifications`. Don't create a section for an area where
you have nothing to raise. Aim for ~5–15 entries total across
all sections; if you produce more, you're nitpicking — collapse
related ones.

Concerns are numbered **continuously across sections** — the
numbering does **not** restart at each `##`. There is only one
concern `1.` in the whole file; the section after Security/privacy
picks up wherever the previous section left off (e.g. `4.`, `5.`,
…). This way the user can refer to "concern #7" unambiguously
throughout the resolution session regardless of which section it
lives in.

Format — each concern starts with an unchecked checkbox `[ ]` so
the file doubles as a progress tracker during resolution:

```
# Concerns — plans/<branch>/

Generated <YYYY-MM-DD>.

## Security/privacy

1. [ ] **<short title>** — one sentence stating the concern,
   referencing requirement numbers (R3), task numbers (1.2),
   and `file:line` where applicable.
   - Proposed: one sentence stating the fix.

2. [ ] ...

## <Other area>

3. [ ] ...

## Verified correct

- <Key decision X> — checked against `<file:line>`, looks correct
  because <reason>.
- ...
```

The **Verified correct** section is optional but recommended:
briefly list key decisions you checked against the source. It
confirms you didn't just skim and gives the user something to
trust the audit on. Omit if you have nothing concrete to put
there.

After writing, tell the user "Drafted `CONCERNS.md` with N
concerns." Then proceed directly into the **Resolution phase**
below — don't make the user re-invoke the command.

## Resolution phase

Read `CONCERNS.md`. Before asking how to proceed, **summarise the
concerns in chat** — one short line per concern, in the same
order as the file (gravity-first), under the same `##` section
headings the file uses, so the user can see the whole punch list
at a glance without opening the file. Don't re-rank — the file's
order is the order. Then use `AskUserQuestion` to ask:

> Walk through one by one, or quick-fix all?

### Walk-through mode

For each concern, top to bottom:

1. Show the concern (one sentence) and your proposed solution
   (one sentence).
2. Use `AskUserQuestion` with four options:
   - **fix** — apply the solution now. The fix can land in any
     of three places, and the right one depends on the concern:
     - **the plan files** (`REQUIREMENTS.md`, `PLAN.md`,
       `TASKS.md`) — the default, for concerns about test
       mechanics, migration ordering, file paths, scripts, or
       anything else specific to this plan's execution. When
       fixing in `TASKS.md`, follow
       `.claude/skills/writing-tasks.md`. Changes must cascade:
       a fix in `REQUIREMENTS.md` propagates to `PLAN.md` and
       `TASKS.md` so tasks remain self-contained.

       **Completed tasks (`[x]`) are frozen — never edit them.**
       The code that implements them shipped; editing the task
       changes nothing about the code, and the task block is
       the historical record of what was done. If a concern
       calls for behaviour that contradicts a `[x]` task,
       capture the correction as a *new* requirement plus a
       *new* task in a *new* phase appended to the bottom of
       `TASKS.md`. Adding new tasks is welcome; rewriting
       completed ones is not.
     - **a `docs/*.md` file** — for concerns where the
       underlying gap is in the living spec rather than this
       plan. Cairn is pre-alpha; the docs are still alive, and
       fixing the doc is often cheaper than wedging a workaround
       into the plan. Be aware: as the codebase grows, more of
       what the docs describe is already shipped, so a doc edit
       may also imply a code/migration/test change.
     - **a Phase 0 in the plan** — for concerns where the
       *plan* depends on a *doc* edit happening first as part
       of executing the plan. Add (or extend) a "Phase 0 — doc
       reconciliation" section near the top of `PLAN.md`'s
       Phase structure (and a matching Phase 0 in `TASKS.md`)
       listing the doc edits that must land before the rest of
       the plan executes. Use this when the doc is the thing
       being *taught* by the plan's execution, not just
       referenced. If Phase 0 itself contains `[x]` tasks
       (i.e., the doc reconciliation already shipped), apply
       the same frozen-tasks rule — extend Phase 0 only with
       new tasks, don't rewrite completed ones.
   - **accept** — record in the plan that this was considered
     and is intentional, so future runs don't re-raise it. The
     home is `REQUIREMENTS.md`'s Non-requirements section
     (create one if missing).
   - **dismiss** — skip without changing the plan. Future runs
     of `/concerns` will likely surface this again. Useful when
     fixing a different concern would make this one moot.
   - **chat** — discuss in conversation. **Yield the turn back to
     the user.** Do not monologue and then immediately re-issue the
     four-option prompt; that defeats the point of choosing "chat."
     If you have something to say, keep it short — one or two
     paragraphs, ideally ending with an open question rather than a
     forced choice — and then stop, letting the user reply freely.
     The conversation continues until one of three things happens:
     (a) the user makes a decision (then carry it out and move on),
     (b) the user asks for your recommendation or for the options
     again (only then re-issue `AskUserQuestion`), or (c) there's a
     natural lull where you can offer a concrete recommendation
     framed as a single question with the new options that emerged
     from the chat. Never auto-re-issue the original four-option
     prompt at the end of every assistant turn.
3. Carry out the action, then tick the concern's checkbox from
   `[ ]` to `[x]` in `CONCERNS.md`. Don't delete it, don't
   renumber the remaining entries — the numbering stays stable
   so the user can refer back to "concern #4" throughout the
   session.

### Quick-fix mode

Apply every "Proposed" fix in one pass — into the plan files by
default, into a `docs/*.md` file when the proposed fix is a doc
edit, or as a Phase 0 entry when the proposed fix explicitly
says so. The same frozen-tasks rule applies: never edit a `[x]`
task, even in quick-fix mode. If a concern's fix would require
changing a completed task, add a new task in a new phase
instead. Tick each concern's checkbox to `[x]` as you go. Then
tell the user the list of concerns that were applied and where
each one landed.

### Cleanup

Once every concern has been handled (every checkbox is `[x]`),
use `AskUserQuestion` to ask the user whether to delete
`CONCERNS.md` or leave it for reference. Default-recommend
deleting it — it's a scratch artefact and the plan is the system
of record — but let the user keep it if they want a paper trail
of what was raised and how each item landed.

## Scope boundary

This command only edits **plan files** (`REQUIREMENTS.md`,
`PLAN.md`, `TASKS.md`), `CONCERNS.md`, and `docs/*.md` when a
doc edit is the right home for a concern. **Never** modify
source code, tests, migrations, or anything else — those changes
belong to the implementation pass. **Never edit `[x]` tasks**,
even in plan files — they're frozen historical record; new
corrections go in new tasks in new phases. **Don't commit
either.** Running `/concerns` multiple times in a row is normal;
the user commits the final result.

## Notes

- `CONCERNS.md` is a scratch artefact — never the system of
  record. It lives inside the plan directory
  (`plans/<branch>/CONCERNS.md`) so each branch carries its own.
  All resolutions land in the plan files (or `docs/*.md`).
  `CONCERNS.md` gets deleted at the end (or kept by user request
  as a paper trail).
- The plan directory is the source of truth.
