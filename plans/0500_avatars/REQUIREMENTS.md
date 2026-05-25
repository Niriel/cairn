# Requirements: Avatars (profile pictures)

Step 5 of the master plan. The MVP (step 4) ships the `<Avatar>` component
rendering initials only. This step adds real profile pictures: a DB column +
two RPCs, a Node upload sidecar, Caddy static serving, and the Edit Profile
UI. Every later step (soft-delete tombstone, account deletion, invites) depends
on `avatar_version` existing and `<Avatar>` being photo-aware, so avatars land
now before any of those.

## R1. `profiles.avatar_version` column

`profiles` gains an `avatar_version int NOT NULL DEFAULT 0` column with a
`CHECK (avatar_version >= 0)` constraint. `0` is the sentinel for "no picture
— render initials." Any positive integer means a file exists at
`/srv/cairn/avatars/{uid}.webp` and the URL must include `?v=<n>` to bust
caches. The column is added before `created_at` per the schema-wide convention
that new payload columns precede timestamps.

The `tg_set_modified_at` trigger on `profiles` must cover `avatar_version` so
a version bump also bumps `modified_at`.

## R2. `bump_avatar_version()` RPC

A `security definer` function `public.bump_avatar_version()` atomically
increments the caller's `avatar_version` by 1 and returns the new value. It
operates on `where id = public.uid()` — callers can only bump their own row.
`execute` is granted to `authenticated` and revoked from `public`. The
increment is server-side so two parallel uploads cannot both write `version = 1`.

## R3. `clear_avatar()` RPC

A `security definer` function `public.clear_avatar()` sets the caller's
`avatar_version` to `0`. Same `where id = public.uid()` predicate, same grant
pattern as R2. Called by the web app when the user taps "Remove picture" —
the file unlink happens separately via the sidecar (R6).

## R4. pgTAP coverage for the migration

`db/tests/avatars.sql` covers:
- Column default is `0`.
- `bump_avatar_version()` returns the incremented value and the row reflects it.
- Calling `bump_avatar_version()` twice yields `2`, not `1` (atomic, not idempotent).
- `clear_avatar()` resets `avatar_version` to `0`.
- `tg_set_modified_at` fires when `avatar_version` changes (i.e. `modified_at` advances).
- Negative: inserting `avatar_version = -1` is rejected by the CHECK constraint.
- Negative cross-user: calling `bump_avatar_version()` or `clear_avatar()` under user A's session
  does not change user B's `avatar_version`.

## R5. Node upload sidecar

A TypeScript Node service in `sidecar/` added as a service to `docker-compose.yml`.
It exposes three routes, all gated by GoTrue bearer-token verification:

- `POST /avatars` — multipart/form-data upload. Enforces an 8 MB request-body
  cap, validates the content-type header (`image/jpeg`, `image/png`,
  `image/webp`, `image/heic`), validates the magic bytes (the header is not
  trusted), checks the decoded pixel dimensions (max 4096×4096 to prevent image
  bombs), resizes to 256×256 WebP at quality 80 using `sharp`, writes the
  result to `/srv/cairn/avatars/{uid}.webp` via atomic rename from a temp file,
  then calls `POST /rpc/bump_avatar_version` on PostgREST with the user's
  bearer token. Returns `{ version: <n>, url: "/avatars/{uid}.webp?v=<n>" }`.
  The original bytes are discarded the moment the resize completes — only the
  ~10 KB WebP is kept.
- `DELETE /avatars/me` — unlinks `/srv/cairn/avatars/{uid}.webp`. Best-effort:
  if the file does not exist the response is still 200.
- `GET /healthz` — Docker healthcheck endpoint, returns 200.

The sidecar is the **only** process with write access to the avatars directory.
Caddy's container mounts it read-only; the sidecar's container mounts it
read-write. This is the structural boundary that prevents a Caddy compromise
from replacing pictures.

## R6. Caddy static serving for avatars

`caddy/Caddyfile` gains a `handle_path /avatars/*` block that serves files
from the avatars directory with `Cache-Control: public, max-age=31536000,
immutable`. The `?v=` query string makes each version's URL truly immutable, so
the long cache is safe. The avatars directory is mounted read-only in Caddy's
container.

## R7. `<Avatar>` component photo branch

The existing `Avatar.svelte` component (which renders an initials disc only)
is extended to branch on `avatar_version`:
- When `avatar_version === 0` (or no value provided): render the initials disc
  exactly as today.
- When `avatar_version > 0`: render `<img src="/avatars/{uid}.webp?v={avatar_version}" alt="">`.

The `Profile` store is updated to fetch `avatar_version` alongside
`display_name` from PostgREST.

## R8. Edit Profile screen

A new screen reachable from the Settings profile chip (the chip that already
exists from step 4, but previously did not navigate anywhere). The screen shows:
- A large avatar (112 px) at the top, either the initials disc or the photo.
- A **Change picture** / **Add a picture** pill button below the avatar.
- A **Remove** pill button (visible only when `avatar_version > 0`).
- An editable display name field.
- A **Save** button (TopBar right) and **Cancel** (TopBar left — `x` icon, does
  not save).

Visual spec: `design/cairn-avatar-screens.jsx` → `EditProfileScreen`.

## R9. Avatar source sheet, crop step, and upload states

The **Change picture** / **Add a picture** button opens an `AvatarSourceSheet`:
a bottom sheet with **Take photo** (uses `<input type="file" accept="image/*"
capture="user">`) and **Choose from library** (uses `<input type="file"
accept="image/*">`), plus **Cancel**.

After a file is picked, the user sees a crop step: a square viewport with a
circular clip overlay, drag and pinch-zoom. **Save** (top-right, in the TopBar)
sends the cropped blob to `POST /avatars` on the sidecar. **← back arrow**
(top-left, in the TopBar) returns to Edit Profile without uploading.

After the user taps Save, a full-screen upload-state view replaces Edit Profile
for the duration of the operation. Five variants, each with its own TopBar
("Profile picture"), a centred icon in a tinted circle, a title, a subtitle,
and an action button:
- **Uploading** — neutral tone, feather icon, title "Uploading…", subtitle
  "Resizing to 256 × 256 and saving to your account.", action "Cancel".
  The TopBar back arrow is **disabled** during active upload — the only
  exit is the "Cancel" action button.
- **Saved** — sage tone, check icon, title "Saved", subtitle "Your picture
  will show up next to your name everywhere.", action "Done". Tapping "Done"
  navigates back to Edit Profile, which re-fetches `avatar_version` from
  the profile store and renders the new picture.
- **Too big** — ember tone, × icon, title "That's a big one", subtitle "That
  picture is larger than 8 MB. Try another.", action "Choose another".
- **Wrong format** — ember tone, × icon, title "Can't read that", subtitle
  "Please pick a JPG, PNG, WebP, or HEIC image.", action "Choose another".
- **No connection** — ember tone, slash icon, title "No connection", subtitle
  "Cairn needs the network to save your picture. Try again when you're back
  online.", action "Try again". The cropped image is preserved so the user
  does not have to re-pick.

For success and error states, the TopBar back arrow returns to the edit view
(`viewState = 'edit'`). The action button on error states ("Choose another")
additionally reopens the source sheet; the back arrow does not — the source
sheet's history guard was already consumed when it closed, so re-opening it
requires an explicit state change, which only the action button makes.

Visual spec: `design/cairn-avatar-screens.jsx` → `AvatarSourceSheet`,
`AvatarCropScreen`, `UploadingState`.

## R10. Remove picture flow

Tapping **Remove** on Edit Profile calls `clear_avatar()` via PostgREST, then
calls `DELETE /avatars/me` on the sidecar (best-effort — if the sidecar call
fails the row's `avatar_version = 0` is still the source of truth and the
orphan sweeper will unlink the file later).

## R11. Orphan sweeper

A nightly cron entry runs a small script that walks `/srv/cairn/avatars/`,
queries `profiles` for all rows where `avatar_version > 0`, and unlinks any
file whose UUID has no matching live row. This is the safety net for every
"sidecar call failed after file write" branch. In steady state the sweep finds
nothing to do.

## R12. `set_display_name(text)` RPC and wiring

The Edit Profile screen's **Save** button must persist display name changes.
`profiles.display_name` is currently read-only via PostgREST (no update RPC
exists). A `security definer` function `public.set_display_name(new_name text)`
trims whitespace, enforces a non-empty, max-100-character constraint, and
updates the caller's own row (`where id = public.uid()`). `execute` is granted
to `authenticated` only. The web app calls this RPC on **Save** and shows a
validation error inline if the name is blank.

pgTAP covers: name is updated, empty string is rejected, name exceeding 100
characters is rejected. Negative cross-user: calling `set_display_name()` under
user A's session does not change user B's `display_name`.

## Non-requirements (explicitly excluded)

- **Multiple avatar sizes (retina 512²)** — straightforward to add post-v1; not
  needed for the MVP screen sizes.
- **AVIF format** — encoder is slow; libavif attack surface is larger. Deferred.
- **Animated avatars** — explicitly not supported; the sidecar strips animation
  on resize.
- **`delete_account` sidecar integration** — the web app's `DELETE /avatars/me`
  call after account deletion lands in step 9 (account deletion plan). The
  sidecar is already running, so the integration is one line in the step-9 plan.
- **Admin `delete_account_as` avatar cleanup** — operator workflow lands in
  step 10 (admin plan).
