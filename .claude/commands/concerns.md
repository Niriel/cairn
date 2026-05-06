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
whatever you spot that doesn't fit them:

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
  `docs/*.md` without a Phase 0 to reconcile them.
- **Anything else** — scope creep, unrealistic estimates, missed
  rollback paths, security holes, performance traps, etc.

Write `CONCERNS.md` at the repo root, **ordered by gravity** — the
concerns that could make us rethink the plan (or even the
architecture) on top; small clarifications and typos at the bottom.
Aim for ~5–15 entries; if you produce more, you're nitpicking —
collapse related ones.

Format:

```
# Concerns — plans/<NNNN_slug>.md

Generated <YYYY-MM-DD>.

1. **<short title>** — one sentence stating the concern.
   - Proposed: one sentence stating the fix.

2. ...
```

Then tell the user: "Drafted `CONCERNS.md` with N concerns; run
`/concerns` again to resolve."

Stop here. The user reads `CONCERNS.md`, then re-invokes the
command.

## Resolution phase

Read `CONCERNS.md`. Use `AskUserQuestion` to ask:

> Walk through one by one, or quick-fix all?

### Walk-through mode

For each concern, top to bottom:

1. Show the concern (one sentence) and your proposed solution (one
   sentence).
2. Use `AskUserQuestion` with four options:
   - **fix** — apply the solution to the plan file now.
   - **accept** — record in the plan file that this was considered
     and is intentional, so future runs don't re-raise it. The
     home is the plan's "What this plan does not cover" / "Out of
     scope" / "Accepted concerns" section; create one if missing.
   - **dismiss** — skip without changing the plan. Future runs of
     `/concerns` will likely surface this again.
   - **chat** — discuss in conversation, then return to this same
     four-option prompt for the same concern.
3. Carry out the action, then remove the concern from
   `CONCERNS.md`.

### Quick-fix mode

Apply every "Proposed" fix to the plan file in one pass. Then tell
the user the list of concerns that were applied.

### Cleanup

Once every concern has been handled (walk-through complete or
quick-fix done), delete `CONCERNS.md`.

## Notes

- `CONCERNS.md` is a scratch artefact — never the system of record.
  All resolutions land in the plan file. CONCERNS.md gets deleted
  at the end.
- The plan file is the source of truth. `CONCERNS.md` is a
  workspace.
