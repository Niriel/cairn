# Writing TASKS.md

Conventions for the **how-for-the-LLM-executor** file in a plan
directory. Sits next to `REQUIREMENTS.md` and `PLAN.md`.

## Purpose

`TASKS.md` is consumed by a fresh Claude session that has never seen
the plan-mode discussion, the requirements doc, or the human-readable
plan. Each task block must be a **self-contained briefing** — the
executor reads one task, runs it, marks it done, and moves on,
without needing to open `PLAN.md` or `REQUIREMENTS.md`.

That self-containment is what makes context small for the executor.
It's the whole point of splitting a plan into three files: humans
read `REQUIREMENTS.md` + `PLAN.md`, the executor reads only its
current task block in `TASKS.md`.

## Format

```markdown
# Tasks

## Reference skills and docs

- **`.claude/skills/<file>.md`** — one-line note on what to look for.
- **`docs/<file>.md`** — one-line note.
- ...

## Phase 1 — <short phase label>

### [ ] 1.1 <imperative task title>

**Created:** <UTC timestamp — `date -u +%Y-%m-%dT%H:%M:%SZ`>
**Completed:**

**Why:** One-sentence justification — why this task exists.

**Prerequisites:** What prior work or existing code this task depends
on. Write "None" for the first task. Reference earlier task numbers
when applicable: "Task 1.1 (`uid()` helper exists)".

**Decisions:**
- Key design choices that affect implementation.
- Inline the relevant detail from `PLAN.md` — don't say "see
  PLAN.md".
- Only include what's relevant to *this* task.

**Reference:** <Optional. When a task involves patterns governed by a
specific skill or doc, point to it with a one-line note. The
top-level "Reference skills and docs" section covers cross-cutting
references; this line is for task-specific ones.>

**Files:**
- `path/to/file.ext` (create | modify)
- ...

**Steps:**
1. RED   — <write failing test>
2. GREEN — <implement to make test pass>
3. ...

**Verify:** `<command 1>` · `<command 2>` · `<command 3>`

### [ ] 1.2 <next task title>

...

## Phase 2 — <short phase label>

### [ ] 2.1 <task title>

...
```

After a task is completed, append:

```markdown
**Notes:**
- <One or two bullets on what was learned, surprises, deviations
  from the plan, etc.>
```

## Format rules

- **Phases:** Always at least Phase 1. PR feedback or scope
  changes add phases later — never edit completed phases.
- **Task numbering:** `N.M` — phase number dot task number within
  phase. Numbers are stable; do not renumber.
- **Checkboxes:** `[ ]` for to-do, `[x]` once the commit lands.
  The leading checkbox in the `### [ ] N.M …` heading is what
  flips to `[x]`.
- **Created/Completed timestamps:** UTC, `YYYY-MM-DDTHH:MM:SSZ`.
  `Created` is filled when the task is first written; `Completed`
  is filled when the task is marked `[x]`.
- **Each task has its own Verify line.** No shared verify section
  at the end of the file — verifying belongs to the unit of work.
- **No horizontal rules between tasks.** The `### [ ]` heading is
  separator enough.
- **Reference skills and docs section at the top.** Lists skills
  (`.claude/skills/`) and docs (`docs/`) used across multiple
  tasks. Per-task `Reference:` lines handle task-specific pointers.

## Writing good tasks

`REQUIREMENTS.md` defines the "what". `PLAN.md` is the human-readable
"why" and "how". `TASKS.md` is the LLM-executable "how". Each task
must read like a complete briefing for someone who walked into the
room cold.

- **Self-contained.** Include justification, prerequisites, key
  decisions, affected files, and steps. Don't say "see PLAN.md" —
  pull the relevant context in. The plan is a fallback reference,
  not required reading.
- **Imperative voice.** "Create the `is_list_member` function",
  not "The membership helper needs to be created."
- **TDD steps.** Prefix each step with `RED` for writing failing
  tests first, `GREEN` for implementation that makes them pass.
  Every task that produces testable logic has RED steps before
  GREEN steps. Tests ship with the code they cover; they are not
  deferred to a later task.
- **Right-sized.** A task is a meaningful chunk of work — typically
  one commit's worth — not a single-line checkbox. Multiple steps
  per task is normal. If a task has only one step, it probably
  belongs merged with its neighbour.
- **Order matters.** Tasks run top-to-bottom. Foundational work
  (types, helpers, schemas) goes before its dependents (policies,
  components, wiring). The executor follows the order; the writer
  earns the order.
- **Test files in the Files list.** When a task has RED steps, the
  test file appears in **Files** alongside the source file.
- **Reference where authoritative guidance lives.** When a task
  involves patterns governed by a skill or doc, add a `Reference:`
  line so a fresh session finds it without searching.
- **Don't duplicate done work.** When appending phases later,
  check existing `[x]` tasks to avoid recreating finished work.

## Example task

```markdown
### [ ] 1.3 Add `public.uid()` helper and pgTAP test

**Created:** 2026-05-09T14:32:11Z
**Completed:**

**Why:** Every RLS policy, RPC, and trigger function in this
migration needs to read the authenticated caller's UUID. The helper
must live in `public` (Cairn-owned), not `auth` (GoTrue-owned), so a
GoTrue upgrade can't clobber it.

**Prerequisites:** Task 1.1 (test bootstrap creates a stub
`auth.users` so tests can `SET LOCAL request.jwt.claims`).

**Decisions:**
- Function body is `language sql stable`, reads
  `request.jwt.claims` (the modern PostgREST v10+ JSON GUC), and
  extracts `sub` as a `uuid`.
- Parenthesisation is load-bearing: `::` binds tighter than `->>`,
  so the cast must wrap the whole `(json ->> 'sub')` expression,
  not just the literal `'sub'`.
- `SET search_path = public` is on the function definition itself —
  no `SECURITY DEFINER`, so this is for clarity, not safety.

**Reference:** `docs/data-model.md` "Helpers" section for the
canonical body and the rationale for living in `public`.

**Files:**
- `db/migrations/0004_domain_schema.sql` (modify)
- `db/tests/0040_uid_helper.sql` (create)

**Steps:**
1. RED   — Create `db/tests/0040_uid_helper.sql` with `plan(3)`:
   (a) `public.uid()` returns the UUID set in
   `request.jwt.claims.sub`; (b) returns `NULL` when the GUC is
   empty; (c) raises when the `sub` value is not a valid UUID.
2. RED   — Run `./scripts/test-db.sh` and confirm the new file
   reports red (function doesn't exist yet).
3. GREEN — In `db/migrations/0004_domain_schema.sql`, add the
   `CREATE FUNCTION public.uid()` block per Decisions, immediately
   after the `DROP TABLE public.profiles` step and before the
   tombstone insert. Body verbatim from `docs/data-model.md`.
4. GREEN — Re-run `./scripts/test-db.sh` and confirm green.

**Verify:** `./scripts/test-db.sh` · `./scripts/check.sh`
```

## Cairn-specific notes

- **Verify command.** Default to `./scripts/check.sh` (runs every
  layer). Use the per-layer commands when only one layer is
  affected:
  - DB-only changes → `./scripts/test-db.sh`
  - Web-only changes → `pnpm check` · `pnpm lint` · `pnpm test`
  - Touching schema/RLS *and* web code → `./scripts/check.sh`
- **TDD is mandatory for testable logic.** RED steps before GREEN
  steps. For DB work specifically: every change to schema, RLS,
  trigger, or view ships with a pgTAP test in `db/tests/`, with
  positive *and* negative cases for any new policy. RLS is the
  security boundary; an untested policy is an unverified claim.
- **Phase 0 — reconcile docs.** When `PLAN.md`'s Phase structure
  starts with a doc-reconciliation phase, mirror it as Phase 0 in
  `TASKS.md`. Doc edits land before code so downstream steps don't
  reference a stale spec.
- **Commit messages.** Cairn requires a domain in parentheses:
  `feat(db):`, `fix(rls):`, `chore(plan):`. The executor follows
  this when committing — call it out in the task's `Notes` if a
  task spans domains and the commit message needs to reflect that.
- **Soft-delete by default.** Any task that adds a domain table
  must include a `deleted_at` column and the matching partial
  index, per `docs/data-model.md`. This often shows up in
  Decisions or Steps.
- **Living docs.** When a task's GREEN phase requires a doc edit
  (e.g., the doc currently says X but the implementation lands Y),
  add the doc edit to the **Files** list and the **Steps**
  explicitly — don't let it slip in as an unannounced side change.
- **Watch for cross-task toolchain coupling.** When a task
  navigates with `goto('/foo')`, imports a symbol, or otherwise
  references something a *later* task creates, the type checker
  or linter will balk even when the runtime works fine. SvelteKit's
  `resolve()` rejects unknown route IDs; `svelte-check` rejects
  unknown env-var reads; `svelte/no-navigation-without-resolve`
  rejects the bare-string workaround. Three ways out, in order of
  preference: (a) **reorder** so the producer task lands first;
  (b) **fold a stub** of the producer into the consumer task's
  Files list (`docs/quality.md` "Navigating to a not-yet-created
  SvelteKit route" documents the SvelteKit-route shape); (c)
  **pre-pick the per-line escape** and name it in the task's
  Decisions so the executor doesn't have to invent it. Decide at
  plan-write time, not mid-task. See `docs/quality.md` for the
  documented escape pattern and the swap-back trigger.
- **Route-level test filenames drop the `+`.** When a task's Files
  list names a colocated test next to a SvelteKit route file
  (`+page.svelte`, `+layout.svelte`, `+error.svelte`), the test
  must be named *without* the `+` prefix — `page.test.ts`,
  `layout.test.ts`, `error.test.ts`. A `+page.test.ts` fails
  `svelte-kit sync` (SvelteKit's manifest scanner only allows the
  recognized `+`-prefixed route kinds), and `pnpm check` therefore
  errors out even though `pnpm test` is happy. Tasks that include
  `pnpm check` in their Verify line catch this in plan-review;
  route-shaped tasks that omit it ship the trap forward. Full rule
  in `docs/frontend-layout.md` → "Filename conventions".
