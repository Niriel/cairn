---
description: Save the plan you have in mind as a numbered file in plans/ on a dedicated branch
---

You have a plan in mind — either drafted in plan mode (see the path in
your plan-mode system reminder) or held in conversation context. Save
it as a file in `plans/` on a dedicated branch.

## Steps

1. **Pick a slug** of 1–3 lowercase words joined by underscores that
   works as both a filename suffix and a git branch name. Examples:
   `db_foundation`, `auth_magic_link`, `pwa_shell`. No leading
   digits.

2. **Pick a number** in the `NNNN_` form already used in `plans/`.
   Plans are numbered in tens (`0010_`, `0020_`, …) so new ones can
   slip between later. If the plan implements a numbered step from
   `plans/0000_implementation_order.md`, use `step_number * 10`,
   zero-padded to four digits. Otherwise pick the next free multiple
   of 10 by listing `plans/`.

3. **Confirm the branch — never write a plan on `main`.**
   Run `git rev-parse --abbrev-ref HEAD`.
   - If `main` (or whatever the repo's main branch is — see the git
     status header in your environment): create the branch with
     `git checkout -b <NNNN>_<slug>`, matching the filename.
   - If on a non-main branch whose name already matches
     `<NNNN>_<slug>` (or is otherwise clearly the branch for this
     plan): stay on it.
   - If on an unrelated non-main branch: ask the user before
     switching, since they may have unfinished work.

4. **Write the plan** to `plans/<NNNN>_<slug>.md`. If a plan-mode
   draft exists at the path noted in your plan-mode system reminder,
   copy/refine its content into the new file. Otherwise write from
   conversation context. Do not commit — the user reviews first.

5. **Order tests before implementation (TDD: red before green).**
   Cairn prefers writing the failing tests first, then the code
   that makes them pass. If the plan involves work that has tests
   (most things do), the "Order of execution" section must put the
   red phase ahead of the green phase. Per-unit interleaving (one
   test → one chunk of code → repeat) is fine; bulk-red-then-green
   (write every failing test, then write the implementation) is
   fine. What's not fine is implementation-then-tests-after — flag
   and reorder anything shaped like that.

6. **Checkbox each step of "Order of execution".** Same convention
   as `plans/0000_implementation_order.md`: each top-level step
   (Phase A / Phase B / step 1 / step 2 / …) gets a leading `[ ]`
   so the file doubles as a progress tracker. The reader ticks
   `[ ]` → `[x]` when the commit for that step is merged. Without
   the checkboxes the plan is a description; with them, it's
   executable across sessions without re-deriving where things
   stand. Add a short note under the section heading explaining
   the convention (mirroring `plans/0000_implementation_order.md`'s
   "How to read this file" preamble) the first time a plan uses
   them — once the convention is widespread the note can shrink
   to a sentence. Sub-bullets within a step don't need checkboxes
   unless the step is large enough that ticking the parent feels
   premature; use judgement.

7. **Audit the plan's risks/gotchas for doc gaps.** If any risk reads
   "the doc doesn't address this" or "the doc says X but X is
   wrong," that's a sign that `docs/*.md` needs reconciling *before*
   the implementation begins. The docs in this repo are canonical
   for downstream steps (account deletion's FK semantics in step 8,
   for example, are pre-baked in step 1 because the docs say so);
   if the implementation diverges silently, later steps reference a
   stale spec and the divergence compounds.

   For every such risk, add an entry to a **Phase 0 — reconcile
   docs** section at the top of the plan's "Order of execution",
   listing the exact `file:line` to edit and a one-line summary of
   the change. Phase 0 lands before bootstrap/red/green. The doc
   edit and the matching code change should land together (or the
   doc edit lands first as its own commit) so reviewers see the
   spec change explicitly.

8. **Confirm** in one sentence: the branch you're on, the file path,
   and what was written.
