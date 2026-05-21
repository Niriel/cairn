# Writing PLAN.md

Conventions for the **how-for-humans** file in a plan directory. Sits
next to `REQUIREMENTS.md` and `TASKS.md`.

## Purpose

`PLAN.md` is the design document a reviewer reads to understand *why*
the implementation is shaped the way it is and *how* the pieces fit
together. It's prose, not a checklist. A future maintainer picking
up the PR — or future-you six months later — should be able to
reconstruct the design rationale from this file without rerunning
plan-mode discussions or re-reading `TASKS.md`.

It is **not** consumed by the LLM executor. `TASKS.md` is the
self-contained briefing for that. `PLAN.md` exists for humans
(reviewers, future contributors) and as a reference for `/concerns`
audits.

## Format

```markdown
# Plan: <feature name>

<One- or two-sentence summary, including a brief *why now* / *why this
work exists* sentence — same hook as REQUIREMENTS.md but framed for
design context rather than contractual statements.>

## Context

<2–6 paragraphs. What's the current state? What problem motivates the
work? What constraints are in play? Reference relevant docs and
existing code by path.>

## Decisions

<Key design choices and their trade-offs. Each decision is a short
named subsection or a bolded label followed by a paragraph. Explain
the *why* — what alternatives were considered and rejected, what
constraint this satisfies. References to requirement numbers (R3, R7)
are useful here.>

**<Decision 1 — short label>.** <Paragraph explaining the choice
and why. Mention rejected alternatives if non-obvious.>

**<Decision 2>.** ...

## Architecture

<How the pieces fit together. Often the most useful section.
Include:>

### New files

- **`path/to/file.ext`** — one-line purpose.
- ...

### Modified files

- **`path/to/file.ext`** — one-line summary of the change.
- ...

<Optional: ASCII or fenced-code diagrams of data flow, module graphs,
or trigger orderings — anything where prose alone is harder to
follow than a sketch.>

## Phase structure

<Brief outline of the phases, mirroring the phases in `TASKS.md`.
One short paragraph per phase, not the step-by-step detail. The
detail lives in `TASKS.md`; this section gives a reviewer the shape.>

1. **Phase 1 — <label>.** <Paragraph.>
2. **Phase 2 — <label>.** <Paragraph.>
3. ...

## Reference docs and skills

- **`docs/<file>.md`** — one-line note on why it matters here.
- **`.claude/skills/<file>.md`** — one-line note.
- ...

## Open questions

<Anything unresolved at write time. Each question should have a
default answer ("punt to a follow-up", "ask in PR review") so the
work isn't blocked. Delete the section if there are none.>
```

## Format rules

- **No fixed length.** Some plans need 200 lines, some 50. Match
  the complexity of the work.
- **Reference requirement numbers.** When a decision satisfies or
  trades off a specific requirement, write `(R3)` inline so the
  cross-link is explicit. Same for tasks: a phase paragraph can
  say "see Tasks 1.1–1.3".
- **Cross-cutting sections at the top, per-phase sections below.**
  Context, Decisions, Architecture, References apply across the
  whole plan; the Phase structure section ties them to the
  executable breakdown.
- **No history once committed.** When appending phases for PR
  feedback or scope changes, add new sections at the bottom — never
  rewrite existing decisions or context. The file is the historical
  record of how the design evolved.

## What goes where

| Content type                     | Home                        |
|----------------------------------|-----------------------------|
| "Must satisfy" contracts         | `REQUIREMENTS.md`           |
| Why a design choice was made     | `PLAN.md` → Decisions       |
| New/modified file inventory      | `PLAN.md` → Architecture    |
| Step-by-step "do this then that" | `TASKS.md`                  |
| RED/GREEN test ordering          | `TASKS.md` → per-task Steps |
| Verify commands                  | `TASKS.md` → per-task Verify|

## Examples

### Good — Decisions section earns its keep

```markdown
## Decisions

**Tombstone user, not nullable FKs.** Account deletion needs to
preserve attribution on lists and items the deleted user
created/owns. Two paths considered: (a) nullable `created_by` /
`deleted_by` columns, (b) a sentinel "deleted user" row in
`auth.users` with `id = '00000000-…'`. Option (b) wins because it
keeps the FKs `NOT NULL`, simplifies every JOIN to `profiles`, and
matches the pattern documented in `docs/account-deletion.md:48`. The
cost is one synthetic insert in the migration and a tombstone-skip
clause in `tg_profile_on_signup`.

**`uid()` lives in `public`, not `auth`.** `auth.users` is owned by
GoTrue. Helpers in `auth.*` risk being clobbered by a GoTrue upgrade.
Putting `public.uid()` in our own schema (sibling to
`public.is_list_member()`) keeps it ours. Supabase's hosted product
has a similar helper; we deliberately don't pull it from there
because we run vanilla self-hosted GoTrue (see
`docs/architecture.md` "Considered and rejected").
```

The reader learns *why* the rejected alternative was rejected, not
just which one was picked.

### Bad — restates the requirement

```markdown
## Decisions

**Use a tombstone user.** Per R5 we need a tombstone user in
`auth.users`. We will create one.
```

This adds nothing the requirement didn't already say. If the choice
is uncontroversial enough that there's nothing to say in
`PLAN.md`'s Decisions section, omit it from there entirely — the
requirement carries the load alone.

## Cairn-specific notes

- **Living docs.** Cairn is pre-alpha. When a plan finds a better
  design than `docs/*.md` describes, prefer **editing the doc** over
  wedging a contradiction into the plan. If the doc edit must land
  *before* the plan's other phases (e.g. because tests reference
  the doc), add a **Phase 0 — reconcile docs** at the top of the
  Phase structure section listing the exact `file:line` edits.
- **TDD ordering is non-negotiable.** When the plan involves
  testable logic (it usually does), the phase structure must put red
  (failing tests) before green (implementation). Per-unit
  interleaving is fine; bulk-red-then-green is fine; green-then-red
  is not. Call this out in the Phase structure section so reviewers
  see the ordering at a glance.
- **pgTAP is load-bearing.** RLS is the security boundary; an
  untested policy is an unverified claim. Any plan touching schema,
  RLS, triggers, or views must have a phase (or sub-phase) that
  ships pgTAP tests with both positive *and* negative cases. See
  `docs/testing.md`.
- **Three test layers.** When a plan crosses layers (DB + JS + UI),
  `PLAN.md`'s Architecture section should call out which layer each
  test type lives in: `db/tests/` for pgTAP, `web/src/**/*.test.ts`
  for Vitest, `web/e2e/` for Playwright. See `docs/testing.md`.
- **Toolchain coupling drives phase order, not just runtime
  dependency.** A task that *navigates to*, *imports from*, or
  *type-references* a destination created by a later task will
  fight the type checker / linter even when runtime behaviour is
  fine. SvelteKit's `resolve()` only accepts route IDs that exist
  in `web/src/routes/`; `svelte-check`'s strict typing rejects
  symbols a downstream task will create; ESLint's typed rules
  reject `import.meta.env.VITE_*` reads when the var isn't yet
  declared in `web/src/vite-env.d.ts`. Before locking in phase
  order, scan the Architecture section's *consumer → producer*
  edges (which file *uses* what, not just which file *imports*
  what) and either reorder so producers land first, fold a
  producer stub into the earlier phase, or pre-decide where the
  per-line escape lands. The cost compounds: each chicken-and-egg
  the plan misses is a mid-task stop for the executor. See
  `docs/quality.md` "Navigating to a not-yet-created SvelteKit
  route" for the documented escape pattern.
