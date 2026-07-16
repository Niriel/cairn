---
description: Save the plan you have in mind as a three-file directory in plans/ on a dedicated branch
---

You have a plan in mind — either drafted in plan mode (see the path
in your plan-mode system reminder) or held in conversation context.
Save it (or extend it) as a directory of three files in `plans/`.

The format of each file is governed by a dedicated skill. Read
these before writing or revising the files; they carry the format
rules and examples:

- `.claude/skills/writing-requirements.md` — `REQUIREMENTS.md` format
- `.claude/skills/writing-plan.md` — `PLAN.md` format
- `.claude/skills/writing-tasks.md` — `TASKS.md` format

`/write-plan` runs after exiting plan mode (or when a plan is held
in conversation context). It does not invent plans — it writes
down a plan you've already worked out with the user.

## Pick the workflow

There are two flavours, distinguished by whether the plan
directory already exists.

Derive the plan directory from the current branch
(`git rev-parse --abbrev-ref HEAD` → `plans/<branch>/`). Then:

- **Plan directory does not exist** (or exists but is empty) →
  **First-run workflow**. You're creating the plan from scratch.
  Most common when starting from `main` after a fresh plan-mode
  session.
- **Plan directory exists** with `REQUIREMENTS.md`, `PLAN.md`,
  and `TASKS.md` → **Revising workflow**. The plan may even be
  partially implemented (some tasks marked `[x]`). New work — PR
  feedback, scope changes, follow-ups, resolving concerns from
  `/concerns` — appends to the existing files.

If you find yourself unsure which mode applies (e.g. directory
exists but is missing one of the three files), ask the user.

## First-run workflow

### 1. Confirm the branch — never write a plan on `main`

Run `git rev-parse --abbrev-ref HEAD`.

- **On `main`** (or the repo's main branch — see the git status
  header in your environment): **stop**. Pick a number and slug
  (step 2 below), propose `<NNNN>_<slug>` as the branch name,
  and ask the user to confirm. On confirmation, create and
  switch to it: `git checkout -b <NNNN>_<slug>`.
- **On a non-main branch whose name clearly matches the plan
  topic** (e.g. `0200_web_foundation` for a "web foundation"
  plan): stay on it.
- **On a non-main branch whose name doesn't match the topic**
  (e.g. you're on `0010_db_foundation` but the user just
  described a settings-screen plan): **stop**. Ask the user to
  confirm this is the right branch, or propose a new one. They
  may have unfinished work on the current branch.

### 2. Pick the plan number and slug

**Slug:** 1–3 lowercase words joined by underscores. Doubles as
the filename suffix and (with the number prefix) the git branch
name. Examples: `db_foundation`, `auth_magic_link`, `pwa_shell`.
No leading digits.

**Number:** four-digit zero-padded prefix, separated from the slug
by `_`.

Numbering convention:

- **Master-plan steps** (the ten items in
  `plans/0000_implementation_order.md`) are numbered in
  **hundreds**: step 2 → `0200`, step 3 → `0300`, …, step 10
  → `1000`.
- **Sub-plans** — follow-ups, fixes, refinements that fall
  between master-plan steps — slip into the gaps. E.g. a small
  fix between steps 2 and 3 could be `0210` or `0250`. The
  hundreds-spaced master-plan numbers leave 99 free slots
  between adjacent steps, which is enough headroom for the
  small adjustments that big features generate.
- If the plan implements a numbered step from
  `plans/0000_implementation_order.md`, prefer the matching
  `step * 100` prefix. Otherwise pick the next free number that
  slots the plan into the right place in the order.
- Run `ls plans/` to see what's already taken.

### 3. Create the plan directory

The directory name is `<NNNN>_<slug>` — same as the branch name.
Create it: `mkdir plans/<NNNN>_<slug>/`.

### 4. Write the three files

In this order: `REQUIREMENTS.md` → `PLAN.md` → `TASKS.md`. Follow
the format in the three writing-\* skills.

- **`REQUIREMENTS.md`** captures the _what_ — numbered `R1`,
  `R2`, … requirements plus a Non-requirements section. See
  `.claude/skills/writing-requirements.md`.
- **`PLAN.md`** captures the _why and how for humans_ —
  Context, Decisions, Architecture, Phase structure,
  References. See `.claude/skills/writing-plan.md`.
- **`TASKS.md`** captures the _how for the LLM executor_ —
  self-contained task blocks with RED-before-GREEN steps. A task is
  a **commit unit**: tests and the implementation they cover belong
  in the same task. RED steps come first within the task; they are
  never split off into a separate prior task, because that would
  leave a commit with failing tests. See
  `.claude/skills/writing-tasks.md`.

If a plan-mode draft exists at the path noted in your plan-mode
system reminder, treat it as raw material and decompose it into
the three files. Do not commit yet — the user reviews first.

### 5. Audit for doc gaps and add a Phase 0 if needed

If any decision in `PLAN.md` reads "the doc doesn't address
this," "the doc says X but X is wrong," or otherwise diverges
from `docs/*.md`, that's a sign the docs need reconciling
_before_ implementation. Cairn is pre-alpha and the docs are
canonical for downstream steps; if implementation silently
diverges, later plans reference a stale spec and the divergence
compounds.

For each such gap, add (or extend) a **Phase 0 — reconcile
docs** section at the top of `PLAN.md`'s Phase structure, and a
matching Phase 0 in `TASKS.md`, listing the exact `file:line` to
edit and a one-line summary of the change. Phase 0 lands before
the implementation phases — the doc edit and matching code
change should land together (or the doc edit lands first as its
own commit) so reviewers see the spec change explicitly.

### 6. Confirm

In one sentence: the branch you're on, the plan directory path,
and that the three files were written. The user will review and
likely ask for changes — edit the files in place. Changes must
cascade: a fix in `REQUIREMENTS.md` must propagate to `PLAN.md`
and `TASKS.md` so tasks remain self-contained.

## Revising workflow

When `plans/<branch>/` already exists, new work **appends** —
never overwrites. This covers PR feedback, scope changes,
post-implementation follow-ups, and resolving concerns from
`/concerns`. The plan-mode discussion that preceded this command
should already have produced the new chunk of work; your job is
to merge it in cleanly.

### 1. Read the existing plan

Read `REQUIREMENTS.md`, `PLAN.md`, and `TASKS.md` from the plan
directory. Read `CONCERNS.md` from the plan directory too if it
exists — resolved concerns drive requirement edits.

Note which tasks in `TASKS.md` are marked `[x]` — those are
**frozen**.

### What's frozen, what's editable, what's appended

| Element                                   | Allowed?                                                                                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing requirements (`R1`, `R2`, …)     | **Edit in place** — for wording fixes, scope narrowing, or PR-driven corrections. Numbers stay stable; never renumber.                                                                                                                  |
| New requirements                          | **Append** at the next number (e.g. `R13` if `R12` was last).                                                                                                                                                                           |
| Non-requirements section                  | **Edit / append** — move dismissed concerns here with rationale.                                                                                                                                                                        |
| Existing phases in `PLAN.md`              | **Frozen** — historical record.                                                                                                                                                                                                         |
| Existing tasks in `TASKS.md` marked `[ ]` | **Frozen by default.** If a not-yet-started task needs changing, prefer adding a new task in a new phase that supersedes it. Touch only for typo-level fixes.                                                                           |
| Existing tasks in `TASKS.md` marked `[x]` | **Frozen, hard.** The code that implements them shipped; editing the task changes nothing about the code. If a `[x]` task's decisions turn out wrong, capture the correction as a _new_ requirement plus a _new_ task in a _new_ phase. |
| New phases in `PLAN.md` and `TASKS.md`    | **Append** at the bottom. Phase numbers continue from the last existing phase. Task numbers within a new phase start at `N.1`.                                                                                                          |

### 2. Update `REQUIREMENTS.md`

For each new or changed requirement from the plan-mode
discussion:

- **New requirements** (the new work needs them): append at the
  next number.
- **Existing requirements that PR feedback / concerns proved
  wrong or incomplete:** edit them in place (fix wording, add
  constraints, narrow scope). Keep the original number — other
  files already reference it.
- **Concerns the team chose to drop:** move them to the
  Non-requirements section with a one-sentence rationale.

If a `[x]` task implemented an old requirement that's now being
tightened, **don't** retroactively rewrite the task. Instead, the
new requirement (or revised wording) drives a new task in a new
phase.

### 3. Append a new phase to `PLAN.md`

Add new phase sections at the bottom describing the additional
work. Reference requirement numbers (R3, R14) inline. Do not
rewrite existing decisions, context, or architecture sections —
they are the historical record of how the design got here.

If the new work introduces a doc gap (the same way Phase 0
handled it for first-run plans), reconcile it as the first
sub-phase of the new work — not by editing the existing Phase 0,
which is the historical record.

### 4. Append a new phase to `TASKS.md`

Add a new `## Phase N — <label>` at the bottom, where `N` is
the next phase number after the last existing one. Tasks within
the new phase are numbered `N.1`, `N.2`, …. Each task is
self-contained per `.claude/skills/writing-tasks.md` — do not
rely on the executor having read existing phases.

Do not modify existing phases. They are the historical record of
completed (or in-progress) work and its `Notes`.

### 5. Tidy up `CONCERNS.md` if it exists

If revising came out of resolving concerns, the resolution loop
in `/concerns` already ticks each entry's checkbox as the fix
lands. After this command finishes, if every checkbox in
`CONCERNS.md` is `[x]`, ask the user whether to delete it (it's
a scratch artefact; the resolved record now lives in the plan
files).

### 6. Confirm

In one sentence: which requirements changed (numbers), which new
phase(s) were added, and where they landed. Do not commit — the
user reviews first.

## Notes

- **Each branch has exactly one plan directory** at
  `plans/<NNNN>_<slug>/`, derived from the branch name. Do not
  read or modify other branches' plan directories.
- **The plan directory is the system of record.** Plan-mode
  drafts and `CONCERNS.md` are scratch artefacts.
- **Don't rename existing plan directories** without weighing
  the cost. Once the branch is pushed or referenced from
  `docs/*.md`, the number is sticky — adjust the new convention
  around it instead.
