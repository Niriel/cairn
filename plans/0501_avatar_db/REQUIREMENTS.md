# Requirements: Avatar DB foundation

The avatar feature needs DB support before the upload sidecar or frontend can
be built. This sub-plan adds a `profiles.avatar_version` column, three
security-definer RPCs, a trigger update, and full pgTAP coverage. It
corresponds to requirements R1–R4 and the DB half of R12 from
`plans/0500_avatars/REQUIREMENTS.md`.

## R1. `profiles.avatar_version` column

`public.profiles` gains an `avatar_version int NOT NULL DEFAULT 0` column with
`CHECK (avatar_version >= 0)`. The sentinel value `0` means no picture — the
frontend renders initials. Any positive integer means a picture exists at
`/srv/cairn/avatars/{uid}.webp`; the integer is the cache-busting token
appended as `?v=<avatar_version>` in the URL.

## R2. `bump_avatar_version()` RPC

`public.bump_avatar_version()` atomically increments the caller's own
`avatar_version` by one and returns the new value (`RETURNS int`). The sidecar
calls this after a successful upload. Server-side increment avoids the
race condition where two parallel uploads both read the same stale version and
both write `version = 1`. The function is `SECURITY DEFINER`, operates only on
`WHERE id = public.uid()`, is revoked from `PUBLIC`, and grants `EXECUTE` to
`authenticated`.

## R3. `clear_avatar()` RPC

`public.clear_avatar()` sets the caller's `avatar_version` to `0`
(`RETURNS void`). The frontend calls this when the user removes their picture.
Same security posture as R2: `SECURITY DEFINER`, `WHERE id = public.uid()`,
revoke from `PUBLIC`, grant `EXECUTE` to `authenticated`.

## R4. `set_display_name(new_name text)` RPC

`public.set_display_name(new_name text)` updates the caller's own
`display_name` (`RETURNS void`). The Edit Profile screen's Save button calls
this instead of a direct `PATCH /profiles`. The function trims whitespace from
`new_name`, rejects a trimmed value that is empty or longer than 100 characters
(raising an error with SQLSTATE `23514`), and writes the trimmed value. Same
security posture as R2–R3. This RPC is scoped to this sub-plan because the Edit
Profile screen (0503) needs it and the migration is the right home.

## R5. Trigger rebind

The existing `t20_set_modified_at` trigger on `public.profiles` watches only
`display_name`. After this migration it must also watch `avatar_version`, so
that calls to `bump_avatar_version()` and `clear_avatar()` advance `modified_at`.
The migration drops the trigger and recreates it with `BEFORE UPDATE OF
display_name, avatar_version`.

## R6. pgTAP coverage

`db/tests/avatars.sql` must cover, at minimum:

- Column default is `0` (INSERT without specifying `avatar_version`)
- `bump_avatar_version()` returns `1` on first call; the row reflects it
- `bump_avatar_version()` called twice yields `2` (atomic increment, not
  idempotent)
- `clear_avatar()` resets `avatar_version` to `0`
- `modified_at` advances after `bump_avatar_version()` (trigger fires)
- `modified_at` advances after `clear_avatar()` (trigger fires)
- `set_display_name()` updates `display_name`, trimming leading/trailing
  whitespace
- `set_display_name()` raises on empty or whitespace-only input
- `set_display_name()` raises when the trimmed name exceeds 100 characters
- Negative: INSERT with `avatar_version = -1` is rejected by the CHECK
  constraint
- Negative cross-user: `bump_avatar_version()` under Alice's session does not
  change Bob's row
- Negative cross-user: `clear_avatar()` under Alice's session does not change
  Bob's row
- Negative cross-user: `set_display_name()` under Alice's session does not
  change Bob's `display_name`

Additionally, three existing test files must be updated:

- `db/tests/schema_shape.sql`: add `has_column` assertion for `avatar_version`
- `db/tests/grants.sql`: add positive `EXECUTE` grant assertions for all three
  RPCs (authenticated role) and negative grant assertions (anon role)
- `db/tests/triggers_modified_at.sql`: add a test confirming that
  `t20_set_modified_at` fires when `avatar_version` is updated

## Non-requirements (explicitly excluded)

- **Sidecar implementation** — the Node upload service is scoped to sub-plan
  0502, not here.
- **Frontend UI** — the `<Avatar>` component, Edit Profile screen, and related
  Svelte changes are scoped to sub-plan 0503.
- **Orphan sweeper** — the nightly file cleanup script is scoped to sub-plan
  0503.
- **Avatar file serving (Caddy)** — static-file block and volume mount are
  scoped to sub-plan 0502.
- **RLS policy changes** — `bump_avatar_version`, `clear_avatar`, and
  `set_display_name` are `SECURITY DEFINER` and include `WHERE id =
  public.uid()`, which is the full authorization boundary. No additional RLS
  policy changes are needed.
