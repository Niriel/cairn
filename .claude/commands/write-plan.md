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

5. **Confirm** in one sentence: the branch you're on, the file path,
   and what was written.
