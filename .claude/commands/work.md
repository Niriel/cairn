---
description: Pick up the next incomplete task in the current branch's plan and execute it
---

Pick up the next incomplete task in the current branch's plan and
execute it. Designed for a fresh Claude session — no prior context
needed; the task block is the briefing.

## When to use

After `/write-plan` (and any `/concerns` resolution), use `/work`
to execute one task at a time. The user reviews between tasks —
that's the natural checkpoint for commits and course corrections.

## 1. Find the next task

1. Get the current branch: `git rev-parse --abbrev-ref HEAD`.
2. The plan directory is `plans/<branch>/`. Read `TASKS.md` from
   that directory.
3. Scan for the first heading matching `### [ ]` — that's the
   next task.
4. If no `[ ]` tasks remain, report "All tasks complete" and stop.
5. Print the task heading (e.g. "**Working on B.2 — FK + trigger
   tests**") so the user knows what's happening.

If the plan directory doesn't exist, tell the user (they may not
have run `/write-plan` yet, or the branch doesn't correspond to a
plan) and stop.

## 2. Read the task block

Read **only** the task block — from its `### [ ]` heading to the
next `###`, `## Phase`, or end of file. That block is your
briefing: it has the Why, Prerequisites, Decisions, Files,
Reference, Steps, and Verify.

Don't read `PLAN.md` or `REQUIREMENTS.md` up front — they're
fallback context if you get stuck (see *If you get stuck* below).
The task block is meant to be self-contained per
`.claude/skills/writing-tasks.md`.

If the task block has a **Reference:** line pointing at specific
sections of `PLAN.md`, `docs/*.md`, or skill files, read those
sections (not the whole file). The task author put the pointer
there because the rationale or detailed spec is too long to inline.

## 3. Execute the steps

Work through **Steps** in order. The step prefix tells you what
phase of TDD the step belongs to:

- **RED** steps: write tests that express the expected behaviour.
  They must fail (or not compile) at this point. For DB work that
  means `./scripts/test-db.sh` reports `not ok` lines for the new
  assertions; for web work, `pnpm test` shows the new test failing.
  **Confirm the red signal** before moving on — a test that passes
  by accident at the RED step (no `ok` from the wrong reason) is
  evidence the test isn't actually exercising the property you
  think it is.
- **GREEN** steps: write the implementation that turns the red
  tests green. Re-run the verifier from the RED step and confirm.
- **Unlabeled** steps: just do them — config changes, file
  renames, doc edits, etc.

If the task lacks RED/GREEN labels but produces testable logic,
treat the test-writing steps as RED and the implementation steps
as GREEN. **Don't write implementation before its tests** — that's
the rule from `CLAUDE.md`'s "Tests and quality (non-negotiable)"
section, and `/concerns` will flag retroactive test-writing on a
later audit.

## 4. Verify

After all steps, run the task's **Verify** line. The task author
chose the verifier; respect their choice. Common ones:

- `./scripts/check.sh` — full gauntlet (sqlfluff, shellcheck,
  shfmt, vitest, pg_prove, prettier, svelte-check). Use this when
  the task spans layers.
- `./scripts/test-db.sh` — pgTAP only. Use when the task is
  schema/RLS/trigger/view-shaped.
- `pnpm check` / `pnpm lint` / `pnpm test` — web-only tasks.
  `pnpm check` runs svelte-check; `pnpm test` runs Vitest.
- `pnpm exec playwright test <file>` — when the task adds or
  modifies a Playwright touch.

If you can't run a verify command in this environment (e.g. the
dev stack isn't up, or a tool isn't installed), say so explicitly
in the report — **don't claim success on the basis of "it should
work."**

## 5. Don't disable rules to get green

If a lint rule, type check, or RLS policy is in your way:

- The rule is right or the code is wrong; figure out which.
- Per-line `// eslint-disable-next-line` or `-- noqa:` is fine
  when justified by an inline comment that names the specific
  reason. Global disables are not.
- Never weaken an RLS policy or remove a constraint to push a
  change through. RLS is the security boundary; weakening it is
  a regression even if every test passes.

If you genuinely can't move forward without bending a rule, stop
and ask the user.

## 6. Complete the task

After the verifier is green:

### a. Append `Notes:` only if there's something worth recording

Skip the Notes block entirely if the task went exactly as
planned. Add it when:

- **Deviations** from the task's described approach and why.
- **Problems** encountered and how they were resolved.
- **User corrections** — if the user redirected your approach,
  note what they said and why.
- **Side work** — unplanned changes needed to complete the task
  (`.gitignore`, an import path fix, a missing dependency).
- **Bugs discovered** in pre-existing code, whether fixed here
  or not.
- **Missing prerequisites** — things the task assumed existed
  but didn't.
- **Doc divergence** — places where `docs/*.md` says X but the
  plan / code now says Y. Cairn is pre-alpha and the docs are
  living specifications; if the divergence isn't already covered
  by a Phase 0 in this plan, flag it for the user.

### b. Mark the task done

Change `### [ ]` to `### [x]` and fill in the **Completed:**
field with the current UTC time. **Get it from the system
clock** (`date -u +%Y-%m-%dT%H:%M:%SZ`) — never guess or
fabricate.

```markdown
### [x] 1.1 Add `db/test-bootstrap.sql` and patch `scripts/test-db.sh`

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-09T14:32:11Z
```

### c. Report to the user

- Which task was completed (number and title).
- One- to three-sentence summary of what was done.
- Any **Notes** worth highlighting.
- The next task title (or "all tasks complete").

## Don't commit

**Committing is the user's decision, not yours.** `/work` never
runs `git commit`, never runs `git push`, never amends or
rewrites history — even if the verifier is green and the task
looks complete. The user reviews between tasks; that review is
the natural checkpoint for catching course corrections cheaply,
and chaining tasks into auto-commits erodes it.

If the user explicitly asks you to commit, follow `CLAUDE.md`'s
style: a domain in parentheses on every commit message
(`feat(db):`, `fix(rls):`, `chore(plan):`, `docs(testing):`),
never a bare type.

## If you get stuck

1. Re-read the task block carefully — the answer is often in
   **Decisions** or **Prerequisites**.
2. Read the `Reference:` line's target sections.
3. Read `PLAN.md` and `REQUIREMENTS.md` in the same plan
   directory for broader context (this is the fallback the
   self-contained-task convention reserves for stuck moments).
4. If still stuck, ask the user rather than guessing.

If you find a problem with the task itself — a contradiction
with `REQUIREMENTS.md`, a missing prerequisite, a test that the
task says should fail but actually can't, a `[x]` task whose
decisions turn out wrong — **don't rewrite the plan from
inside `/work`**. Stop, report the issue to the user, and
suggest running `/concerns` to capture and resolve it. The
plan files (especially completed `[x]` tasks) are historical
record; concerns and revisions land via `/concerns` and
`/write-plan` respectively.

## One task per invocation

Execute exactly one task, then stop. The user reviews and
chooses whether to commit, refine, or continue with `/work`
again. Skipping the review by chaining tasks erodes the
checkpoint that lets the user catch course corrections cheaply.
