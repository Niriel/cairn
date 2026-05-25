# Requirements: Avatar frontend (0503)

Sub-plan of `0500_avatars`. Covers R7–R12 (UI half). R1–R4 are in
`0501_avatar_db`; R5–R6 are in `0502_avatar_sidecar`.

## R7. `<Avatar>` component photo branch

`Avatar.svelte` gains two optional props: `uid?: string` and `avatarVersion?:
number` (defaults: `''` and `0`). Branching logic:
- `avatarVersion > 0` and `uid` is non-empty → render `<img
  src="/avatars/{uid}.webp?v={avatarVersion}" alt="">`.
- Otherwise → render the coloured initials disc (existing behaviour, unchanged).

The Profile store fetches `avatar_version` alongside `display_name`, and
exposes `uid` from the signed-in session. All existing Avatar call sites must
be updated to pass `uid` and `avatarVersion`. Data-model types for list members
and item vote rows must be extended to carry `avatar_version` so those callers
can pass it.

## R8. Edit Profile screen

A route at `/profile`, navigable from the Settings profile chip (which must be
made tappable). The screen shows:
- A 112 px avatar (photo or initials disc) at the top.
- A **Change picture** / **Add a picture** pill button below.
- A **Remove** pill button (visible only when `avatar_version > 0`).
- An editable display name `<input>`.
- TopBar with Cancel (× icon, left) and Save (button, right).

Visual spec: `design/cairn-avatar-screens.jsx` → `EditProfileScreen`.

## R9. AvatarSourceSheet, AvatarCropScreen, upload states

**AvatarSourceSheet** — a bottom sheet (Sheet + history guard) with: Take photo
(`<input type="file" accept="image/*" capture="user">`), Choose from library
(`<input type="file" accept="image/*">`), Cancel.

**AvatarCropScreen** — a full-screen view (in-page view state) showing the
picked image with a circular crop overlay. Drag to reposition, pinch/wheel to
zoom, implemented with native `pointermove` / `wheel` / `touchstart` events
(no external gesture library). Tapping Save crops to a square blob and
initiates upload. Back arrow returns to edit view without uploading.

**Upload states** — five full-screen in-page view states, each with a centred
icon in a tinted disc, a title, a subtitle, and an action button. The
`viewState` machine in the profile route drives them:
- `uploading` — spinner icon, back arrow disabled, "Cancel" button.
- `success` — check icon, "Done" navigates back to edit.
- `too-big` — × icon, "Choose another" opens source sheet.
- `wrong-format` — × icon, "Choose another" opens source sheet.
- `network` — slash icon, "Try again" retries with preserved crop blob.

Visual spec: `design/cairn-avatar-screens.jsx` → `AvatarCropScreen`,
`UploadingState`.

## R10. Remove picture flow

Tapping **Remove** on Edit Profile calls `POST /rpc/clear_avatar` (PostgREST
RPC, updates the row's `avatar_version` to 0), then calls `DELETE /avatars/me`
on the sidecar (best-effort — failure leaves an orphan for the sweeper to
handle). Profile store is updated to reflect `avatar_version = 0`.

## R11. Orphan sweeper

A shell script `scripts/sweep-avatars.sh` runs as a nightly cron job. It lists
every UUID-named file under `/srv/cairn/avatars/`, queries Postgres for
`profiles` rows with `avatar_version > 0`, and unlinks any file with no
matching live row. A `crontab.example` file documents the expected cron entry
and the required `DATABASE_URL` env var.

## R12. `set_display_name` RPC wiring

The Edit Profile Save button calls `POST /rpc/set_display_name` with body
`{ new_name: <trimmed display name> }`. If the RPC returns a `23514`
(check_violation) error, an inline validation message is shown: "Name can't be
blank" when the trimmed value is empty, or "Name must be 100 characters or
fewer" for a non-blank name exceeding the limit. On success, the profile
store's `displayName` is updated and the screen navigates back.

## Non-requirements (explicitly excluded)

- **Client-side crop is authoritative** — the client crop is a UX preview
  only; the sidecar re-validates and re-resizes server-side. No frontend
  validation of crop dimensions is required.
- **Offline upload queue** — the network error state prompts the user to retry
  manually. No service-worker or Background Sync queue is in scope here.
- **Fetch abort on Cancel** — cancelling the uploading state does not abort the
  in-flight fetch; if the upload completes after Cancel the profile store
  updates silently. AbortController wiring is deferred post-v1.
