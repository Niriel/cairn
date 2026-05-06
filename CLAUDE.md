# Cairn

You are working on **Cairn**, a SvelteKit Progressive Web App for
collaborative ranked lists, backed by a self-hosted Postgres + PostgREST +
GoTrue stack on a Hetzner VPS. (We use the Supabase open-source components,
not Supabase's hosted service — the no-hyperscalers constraint rules out the
latter; see `docs/architecture.md` "Considered and rejected".) The full
specification is in `docs/`, with visual references in `design/`.

## Read first

1. `docs/README.md` — overview and reading order
2. `docs/architecture.md` — runtime topology (SvelteKit PWA + self-hosted Postgres/PostgREST/GoTrue on Hetzner)
3. `docs/data-model.md` — schema, RLS, triggers, views
4. The doc most relevant to whatever you're being asked to build

## Visual reference

`design/Cairn - Design Canvas.html` (open in a browser to see every screen —
high-fidelity mockups in iOS/Android, light/dark). The JSX in `design/` is a
visual and structural reference — re-implement screens idiomatically in
Svelte rather than porting React verbatim. Design tokens (`CAIRN_LIGHT` /
`CAIRN_DARK` in `design/cairn-ui.jsx`) can be lifted directly.

## Conventions

- Soft-delete by default (see `docs/data-model.md`).
- Email is private — never shown in the UI (see `docs/invites.md`).
- Button pairs: right is forward/committal, left is backward/destructive
  (see `docs/ui.md` → "Button order in pairs").
- The circle model is one-directional and invisible to the other side
  (see `docs/circles.md`).
- Guiding principle: the simplest thing that works, with attribution and
  undo built in (see `docs/architecture.md`).

## Style

- Commit messages: always include a domain in parentheses —
  `feat(calendar):`, `fix(sync):`, `chore(css):`, never bare `feat:` or
  `fix:`.
