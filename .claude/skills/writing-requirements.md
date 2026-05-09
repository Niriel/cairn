# Writing REQUIREMENTS.md

Conventions for the **what**-file in a plan directory. Sits next to
`PLAN.md` and `TASKS.md`. Loaded by humans during review and by `/concerns`
during audits, but **not** by the executor — the executor reads
`TASKS.md`, which inlines what each task needs.

## Purpose

`REQUIREMENTS.md` is a numbered list of *what the implementation must
satisfy*, plus a short *why* on top. It pins down behaviour and
contracts independently of how they get implemented. When a reviewer
later asks "did we ship X?", they should be able to answer it from
this file alone.

It is **not** a design document (that's `PLAN.md`) and **not** a
to-do list (that's `TASKS.md`). It survives unchanged through
implementation churn — only scope changes touch it.

## Format

```markdown
# Requirements: <feature name>

<One- or two-sentence description of the feature, including a brief
"why this work exists" sentence. Both for humans and for the LLM.>

## R1. <Short imperative title>

<Self-contained statement of what the system must do. Prose, not
steps. Enough detail to be unambiguous. Code snippets welcome when
they pin down a type signature, SQL shape, or API contract.>

## R2. <Title>

...

## Non-requirements (explicitly excluded)

- **<Short label>** — one-sentence rationale for why this is out of
  scope.
- **<Short label>** — ...
```

## Format rules

- **Header:** `# Requirements: <feature name>` followed immediately
  by a one- or two-sentence description that includes the *why*.
  No separate "Why" heading — the prose under the H1 carries it.
- **Numbered requirements:** `## R1.`, `## R2.`, `## R3.`, …
  Numbers are stable: never renumber after the file lands, because
  `PLAN.md` and `TASKS.md` and `CONCERNS.md` all reference them by
  number. Append new requirements at the bottom with the next
  number.
- **One requirement per `## R`-heading.** If you find yourself
  writing "and also", split it into two.
- **Prose over bullets.** Each requirement is a paragraph or two,
  not a bulleted list. Bullets are fine inside a requirement when
  enumerating cases.
- **Non-requirements section is mandatory.** End the file with
  `## Non-requirements (explicitly excluded)` listing things
  deliberately left out, each with a one-sentence rationale. This
  prevents future implementers from re-adding them and prevents
  `/concerns` from re-flagging them.

## What goes where

- **What and why → REQUIREMENTS.md.** Behaviour, contracts,
  invariants, "must satisfy" statements.
- **How → PLAN.md.** Architecture, file lists, phase breakdown,
  trade-offs.
- **Executable how → TASKS.md.** Step-by-step instructions, RED/GREEN
  ordering, verify commands.

The line between "what" and "how" is pragmatic, not dogmatic. When a
design decision is inseparable from the requirement (e.g., a specific
column name, an exact SQL function body, a wire-format JSON shape),
include it in `REQUIREMENTS.md` — pinning it down here is what the
file is for.

## Examples

### Good — pins down a contract

```markdown
## R6. `public.uid()` reads the `sub` claim from request GUC

A `language sql stable` function `public.uid()` returns the
authenticated user's UUID by reading `request.jwt.claims` (set
per-request by PostgREST v10+) and extracting the `sub` field. The
function lives in `public`, not `auth`, so a future GoTrue release
can't clobber it. Body:

```sql
CREATE FUNCTION public.uid() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = public
AS $$
  SELECT (
    (NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb
    ->> 'sub'
  )::uuid;
$$;
```
```

### Good — small, behavioural, self-contained

```markdown
## R3. Soft-deleted lists stop appearing in `lists` selects

`lists_select` RLS policy returns only rows where `deleted_at IS NULL`.
Soft-deleted rows remain readable through the `lists_deleted` view
(see R8) so the trash UI can surface them.
```

### Bad — describes implementation

```markdown
## R3. Add a CHECK constraint on votes.value

In the migration, add `CHECK (value BETWEEN -3 AND 3 AND value <> 0)`
to the `votes` table.
```

The requirement is *what* (vote values are bounded and non-zero), not
*where the CHECK clause lives*. The migration detail belongs in
`PLAN.md` or `TASKS.md`. Rewrite as:

```markdown
## R3. Vote values are bounded and non-zero

`votes.value` is an integer in the closed range [-3, +3] excluding 0.
Inserts and updates outside this range are rejected at the database.
```

## Cairn-specific notes

- **Living docs.** Cairn is pre-alpha; `docs/*.md` are living
  specifications. When a requirement supersedes or refines what a
  doc currently says, note it explicitly — the doc edit may need to
  land as part of the same plan (often as a Phase 0 in `PLAN.md`).
- **RLS is the security boundary.** Any requirement that touches
  authorization must call out *both* the positive case (allowed users
  can do X) *and* the negative case (others cannot). pgTAP tests
  follow the same rule (see `docs/testing.md`); the requirement
  drives the test.
- **Privacy contract.** `docs/invites.md`, `docs/circles.md`, and
  `docs/account-deletion.md` define what's private. If a requirement
  surfaces a field in UI/API/logs, check it against those docs and
  state explicitly that it doesn't leak anything they protect.
