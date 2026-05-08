---
description: Audit the current branch's plan for problems, then walk through fixing them
---

Audit the plan that matches the current branch and either draft a
`CONCERNS.md` listing problems or walk through resolving an existing
one.

## Step 1 — Locate the plan

Run `git rev-parse --abbrev-ref HEAD` to get the branch name. The
matching plan lives at `plans/<branch>.md` (the convention enforced
by `/write-plan`). If it doesn't exist, tell the user and stop —
they may not have run `/write-plan` yet, or the branch doesn't
correspond to a plan.

## Step 2 — Audit phase or Resolution phase?

- If `CONCERNS.md` does **not** exist at the repo root → run the
  **Audit phase** below.
- If `CONCERNS.md` exists → skip to **Resolution phase**.

## Audit phase

Read the plan in full. Also skim any docs the plan references (so
you can spot divergences). Use your judgement — anything that
would slow down, mislead, or burn an executor is fair game. The
categories below are *examples*, not a closed checklist; raise
whatever you spot that doesn't fit them.

**Security and privacy concerns are top priority** — look for
them first, and when present they belong at the top of the
gravity ordering (above contradictions, doc divergence, etc.).
They're easy to introduce in subtle ways and expensive to
unbreak after the fact, so a thin one is still worth raising.

- **Security vulnerabilities** — anything that could let a
  caller see or mutate data they shouldn't, or that widens
  the attack surface. Examples to scan for, not an exhaustive
  list: missing/weak authorization checks (in Cairn that's
  usually RLS — but also RPCs, triggers, views), `SECURITY
  DEFINER` functions without a locked-down `search_path`,
  policy/grant matrices that hand verbs to roles that
  shouldn't have them, policy/trigger interactions that let
  clients spoof attribution, missing identity re-checks
  inside RPCs, trust placed in unsigned or unvalidated
  input (JWT claims, request bodies, env vars), injection
  vectors (SQL, command, template) in migrations or
  scripts, secrets committed to the repo, side-channels
  (timing, error-message oracles, status-code differences),
  and tests that only prove the positive case when the
  policy *is* the boundary.
- **Privacy issues** — anything that risks leaking personal
  data or violating the project's privacy contract as
  expressed in `docs/`. Examples to scan for, not exhaustive:
  fields surfaced in UI/API/logs that the docs say must
  stay private, joins or views that expose one user's
  relationships to another, error messages or status codes
  that act as enumeration oracles, soft-deleted or
  tombstoned data reachable from the wrong path, telemetry
  or analytics fields that capture identifiable content,
  and any path where a deleted user's data persists past
  the contract in `docs/account-deletion.md`. The docs
  (especially `docs/invites.md`, `docs/circles.md`,
  `docs/account-deletion.md`) are the source of truth for
  what counts as private — read them before deciding
  whether a thing is a leak.
- **Contradictions** — two parts of the plan that disagree.
- **Unclear instructions** — places where an executor would have to
  guess.
- **Foreseeable bugs** — code patterns the plan implies that you can
  already tell will fail: ordering issues, race conditions, silent
  failures, missing error paths at boundaries, contradictory
  invariants.
- **Missing tests** — features the plan adds without corresponding
  test coverage, given the project's TDD stance.
- **TDD violations** — places where green would land before red.
- **Forgotten dependencies** — files/configs/scripts the plan needs
  to touch but doesn't list.
- **Doc divergence** — places where the plan diverges from
  `docs/*.md` without a Phase 0 to reconcile them. Cairn is
  pre-alpha; the docs in `docs/` are still living
  specifications, not frozen prose. When a plan's design choice
  is *better* than what the doc says, the right fix is often
  to **edit the doc** (or add a *Phase 0* to the plan that
  edits the doc as its first step) rather than to wedge a
  contradiction into the plan. As the codebase grows, more of
  what the docs describe is already implemented in code —
  changing a doc then implies changing code, migrations, or
  tests too. Use judgement: a doc-only edit is cheap when the
  doc is purely descriptive of an unbuilt area, and expensive
  when the described thing is already shipped.
- **Code smell / unusual practices** — patterns the plan implies
  that work but a seasoned practitioner of the language, framework,
  or tool would flag: fighting the framework, reinventing a
  built-in, idioms that read fine to a generalist but a specialist
  would call out as non-idiomatic. The user is not always able to
  spot these themselves and is counting on you to know what good
  looks like in the relevant ecosystem (SvelteKit, Postgres,
  PostgREST, GoTrue, pgTAP, ESLint, etc.) and call it out.
- **Anything else** — scope creep, unrealistic estimates, missed
  rollback paths, performance traps, etc.

Write `CONCERNS.md` at the repo root, **ordered by gravity** — any
**security or privacy concerns first** (these top everything else,
even an architecture-level rethink), then concerns that could
otherwise make us rethink the plan, then small clarifications and
typos at the bottom. Aim for ~5–15 entries; if you produce more,
you're nitpicking — collapse related ones.

Format — each concern starts with an unchecked checkbox `[ ]` so
the file doubles as a progress tracker during the resolution phase:

```
# Concerns — plans/<NNNN_slug>.md

Generated <YYYY-MM-DD>.

1. [ ] **<short title>** — one sentence stating the concern.
   - Proposed: one sentence stating the fix.

2. [ ] ...
```

Tell the user: "Drafted `CONCERNS.md` with N concerns." Then
proceed directly into the **Resolution phase** below — don't make
the user re-invoke the command.

## Resolution phase

Read `CONCERNS.md`. Before asking how to proceed, **summarise the
concerns in chat** — one short line per concern, in the same order
as the file (gravity-first), so the user can see the whole punch
list at a glance without opening the file. Group them lightly if
it helps readability ("top three could change the plan; 4–6 are
real bugs in the spec; the rest are clarifications") but don't
re-rank — the file's order is the order. Then use
`AskUserQuestion` to ask:

> Walk through one by one, or quick-fix all?

### Walk-through mode

For each concern, top to bottom:

1. Show the concern (one sentence) and your proposed solution (one
   sentence).
2. Use `AskUserQuestion` with four options:
   - **fix** — apply the solution now. The fix can land in any
     of three places, and the right one depends on the
     concern:
     - **the plan file** — the default, for concerns about
       test mechanics, migration ordering, file paths, scripts,
       or anything else specific to this plan's execution.
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
       reconciliation" section near the top of the plan listing
       the doc edits that must land before the rest of the plan
       executes. Use this when the doc is the thing being
       *taught* by the plan's execution, not just referenced.
     Pick the cheapest home that makes the concern not come
     back. If unsure, ask the user via **chat**.
   - **accept** — record in the plan file that this was considered
     and is intentional, so future runs don't re-raise it. The
     home is the plan's "What this plan does not cover" / "Out of
     scope" / "Accepted concerns" section; create one if missing.
   - **dismiss** — skip without changing the plan. Future runs of
     `/concerns` will likely surface this again.
   - **chat** — discuss in conversation, then return to this same
     four-option prompt for the same concern.
3. Carry out the action, then tick the concern's checkbox from `[ ]`
   to `[x]` in `CONCERNS.md`. Don't delete it, don't renumber the
   remaining entries — the numbering stays stable so the user can
   refer back to "concern #4" throughout the session.

### Quick-fix mode

Apply every "Proposed" fix in one pass — into the plan file by
default, into a `docs/*.md` file when the proposed fix is a doc
edit, or as a Phase 0 entry in the plan when the proposed fix
explicitly says so. Tick each concern's checkbox to `[x]` as you
go. Then tell the user the list of concerns that were applied
and where each one landed.

### Cleanup

Once every concern has been handled (every checkbox is `[x]`), use
`AskUserQuestion` to ask the user whether to delete `CONCERNS.md`
or leave it for reference. Default-recommend deleting it — it's a
scratch artefact and the plan file is the system of record — but
let the user keep it if they want a paper trail of what was raised
and how each item landed.

## Notes

- `CONCERNS.md` is a scratch artefact — never the system of record.
  All resolutions land in the plan file. CONCERNS.md gets deleted
  at the end.
- The plan file is the source of truth. `CONCERNS.md` is a
  workspace.
