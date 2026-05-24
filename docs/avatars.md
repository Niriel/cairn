# Avatars (profile pictures)

This document describes how profile pictures are stored, served, replaced, and removed in Cairn. It assumes the architecture described in `architecture.md` (PostgreSQL + PostgREST + GoTrue + Caddy, all self-hosted), the schema in `data-model.md`, and the conventions in `ui.md`. The headline rule: **bytes on disk, version in the row**. Postgres holds a tiny integer per profile; the bytes live in a flat directory served by Caddy.

The feature is a post-`0010_db_foundation` addition — the `profiles` table shipped in that migration without an avatar column. Adding avatars is a single `ALTER TABLE` plus a small filesystem path on the VPS plus a sidecar that does the resize. The seven attribution columns (`*_by`) with `on delete set default` semantics that already ship cover everything we need on the database side — there is no schema-wide refactor here.

## What we settled on

| Decision | Choice |
|---|---|
| **Where do bytes live?** | The host filesystem at `/srv/cairn/avatars/{uid}.webp` — one fixed-path file per user, mounted into the Caddy container read-only. |
| **What's in the row?** | A single `int` column, `profiles.avatar_version`, defaulting to `0`. `0` means "no picture, render initials." Any positive integer is a cache-busting token. |
| **Who serves the bytes?** | Caddy, with a `handle_path /avatars/* { root * /srv/cairn/avatars }` block. The web app does not. PostgREST does not. |
| **What URL does the app render?** | `https://cairn.<domain>/avatars/{uid}.webp?v={avatar_version}`. The `?v=` is the cache buster. |
| **Who resizes?** | A tiny upload sidecar — a single-purpose HTTP service that receives the upload, validates it, resizes to 256×256 WebP, writes the file, and calls a Postgres RPC to bump `avatar_version`. |
| **What does the user upload?** | A photo (camera or library) cropped client-side to a square preview. The sidecar re-validates and re-resizes server-side. The client crop is UX only — never trusted. |
| **What size on disk?** | 256×256 WebP, quality 80. Roughly 8–15 KB per face. The PWA never needs a larger size in v1 — the largest on-screen render is the profile sheet's hero avatar at ~128 CSS pixels. |
| **What's the fallback?** | The same coloured initials disc the app already renders. `avatar_version = 0` skips the `<img>` and renders initials directly. Same path covers the "Deleted user" tombstone (`avatar_version = 0` on the tombstone profile, gray disc, no initials). |

## Why this shape

Three options were on the table; the filesystem path won by a wide margin.

**Bytes-on-row (`profiles.avatar bytea`).** Rejected. Stuffing 10 KB of WebP into the row turns every `select * from profiles` into a transfer of the picture too. PostgREST `?select=` could mitigate but every consumer would have to remember to opt out. The row gets fat; backups and replication slow; the API gets confusingly slow without an obvious cause. The win — "no separate storage to manage" — is illusory: you've just made Postgres the storage and given it a worse job than the filesystem does for free.

**S3-compatible blob storage (MinIO sidecar, or Hetzner Object Storage).** Rejected on cost and complexity. Adds a new container, a new protocol, a new set of credentials, new IAM-shaped policies, and a hard dependency on a service that does roughly what `nginx -t` already does. The "no hyperscalers" constraint (see `architecture.md`) already biases away from S3-as-a-service; running MinIO ourselves is reasonable but trades simplicity we have for simplicity we don't, for no v1 user benefit.

**Filesystem + integer column.** Chosen. The filesystem is the world's most boring blob store, it already exists, it survives restic backups identically to the database, and Caddy serves static files at line rate without our help. The integer column is two characters of SQL. The cache-busting URL pattern (`?v=N`) is older than PostgREST and the browser's HTTP cache understands it natively — no header gymnastics required.

The pattern is well-trodden: GitLab does this, Mastodon does this, every self-hosted forum software since 2003 does this. We are not innovating on storage.

## Schema delta

A single column on `profiles`, baked into a new migration (`db/migrations/0007_avatars.sql`). (`ALTER TABLE ADD COLUMN` appends after the last physical column; per the schema convention "payload before timestamps" governs `CREATE TABLE` statements and `\d` canonical form, not the physical order after `ALTER` — position is immaterial to correctness.)

```sql
alter table public.profiles
  add column avatar_version int not null default 0
    check (avatar_version >= 0);
```

`0` is the sentinel for "no picture" — render initials. Any positive integer means "a file exists on disk at `/srv/cairn/avatars/{uid}.webp` and the URL must include `?v=<this number>` to bust caches." Monotonically increasing; an avatar replacement increments rather than rotates.

Three RPC additions in the same migration:

```sql
-- Called by the sidecar after a successful upload. Bumps the version
-- on the caller's own profile. The sidecar runs as `authenticated`
-- with the user's bearer token — no service role.
create or replace function public.bump_avatar_version()
returns int
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set avatar_version = avatar_version + 1
   where id = public.uid()
  returning avatar_version;
$$;

revoke all on function public.bump_avatar_version() from public;
grant  execute on function public.bump_avatar_version() to authenticated;

-- Called by the web app directly when the user taps "Remove picture."
-- The sidecar then unlinks the file in a separate request.
create or replace function public.clear_avatar()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set avatar_version = 0
   where id = public.uid();
$$;

revoke all on function public.clear_avatar() from public;
grant  execute on function public.clear_avatar() to authenticated;
```

No new RLS policy is needed: `profiles_update` already gates writes to the caller's own row, and both RPCs run as `security definer` with an explicit `where id = public.uid()` predicate. `bump_avatar_version` is a separate RPC (rather than letting the sidecar `PATCH /profiles?id=eq.<self>`) so the increment is server-side atomic — two parallel uploads cannot both write `version = 1`.

The same migration adds a third RPC, `public.set_display_name(new_name text)`, for the Edit Profile screen (0503). It trims whitespace from the input, rejects empty or >100-character trimmed values with SQLSTATE `23514` (`check_violation`), and updates `display_name` using the same `SECURITY DEFINER` / `WHERE id = public.uid()` posture. The Edit Profile screen calls `/rpc/set_display_name` rather than a direct `PATCH /profiles` so trimming and length validation are enforced server-side. Direct `PATCH /profiles` remains possible via the existing `profiles_update` RLS policy but is unvalidated.

The `tg_set_modified_at` trigger on `profiles` should have `avatar_version` added to its column list so a version bump also bumps `modified_at` — same shape as adding any new payload column.

## The sidecar

A single-binary HTTP service (Go, Python, or Node — language is uninteresting; the existing stack is Docker-Compose anyway). It exposes exactly three routes, all gated by GoTrue bearer-token verification:

- `POST /avatars` — multipart upload. Enforces an **8 MB request-body cap**, validates content-type (`image/jpeg`, `image/png`, `image/webp`, `image/heic`), validates the magic bytes (don't trust the header), checks the **decoded bounds (max 4096×4096)**, resizes to 256×256 WebP quality 80, writes to `/srv/cairn/avatars/{uid}.webp` (atomic rename from a temp file), then calls `POST /rpc/bump_avatar_version` on PostgREST with the user's bearer token. Returns the new version number and the cache-busted URL. **The original bytes are discarded the moment the resize returns** — only the ~10 KB WebP file is kept; nothing else is logged or retained.
- `DELETE /avatars/me` — unlinks `/srv/cairn/avatars/{uid}.webp` and is best-effort (file may not exist). Called by the web app *after* a successful `clear_avatar` RPC or `delete_account` RPC.
- `GET /healthz` — Docker healthcheck.

The sidecar is the only process that writes to `/srv/cairn/avatars/`. The mount is read-only in Caddy's container and read-write in the sidecar's, so a Caddy compromise can't replace someone's picture.

### Why the 8 MB cap *and* the 4096² decoded-bounds check

Two independent gates, doing different jobs:

- **The 8 MB request-body cap** is the cheap front-line check — it bounds the network workload and the work to even *start* decoding. It's calibrated against phone-camera reality: iPhone HEIC is typically 2–4 MB, an Android JPEG 3–8 MB. A tighter cap (say 1 MB) would force virtually every untouched phone photo through a manual compression step before upload, which is hostile UX; a looser cap buys the user nothing and gives an attacker more room.
- **The 4096×4096 decoded-bounds check** is the load-bearing one. A small file can decode to a huge pixel buffer (image bombs are a real class of exploit: a 200 KB JPEG can blow up to a 100 MP raw image, and `libheif` / `libjpeg-turbo` will dutifully allocate the buffer before anyone notices). The decoded-pixel cap bounds in-memory work independently of file size, which is what actually protects the sidecar from OOM-ing the VPS.

The two gates compose: 8 MB filters the obvious nonsense at HTTP-parse time before any image library sees the bytes; 4096² is what catches the clever cases. Both are checked before resize; whichever rejects first wins, and the rejection is the same generic *"That picture is larger than 8 MB"* / *"Can't read that"* response to the client — we don't tell the attacker which gate caught them.

The discard-after-resize property closes the third side: no full-resolution copy is ever persisted, logged, or backed up. The only artifact on disk is the 256×256 WebP at ~10 KB, which is what every consumer of `profiles` reads.

Why a sidecar instead of doing the resize in Postgres (`plpython3u`)?

- Postgres should not be in the business of decoding untrusted image bytes. The attack surface of libwebp / libjpeg-turbo / libheif is not where database security ends.
- `plpython3u` is *untrusted* PL/Python — Postgres documentation pulls no punches about this. Running it in the only process that holds your data is a category error.
- The image-processing library ecosystem (Pillow, libvips, sharp) is well-trodden in HTTP-server-land. Use it there.
- A sidecar can be restarted, OOM-killed, or rebuilt without taking the database with it. Resize bugs that crash the process don't crash queries.

The sidecar is a third-party-tool-shaped concern, but the third-party tool is one we write — fewer than 300 lines in any reasonable language. The "boring components" rule (see `architecture.md`) tolerates this: a small purpose-built service with no state of its own is boring enough.

## Cache busting

The URL the app renders is `https://cairn.<domain>/avatars/{uid}.webp?v={avatar_version}`. Every consumer of `profiles` already needs `avatar_version` for this; PostgREST's `?select=id,display_name,avatar_version` handles it without changes.

The query string is enough — browsers cache `foo.webp?v=1` and `foo.webp?v=2` as separate URLs. Caddy is told to set a long `Cache-Control: public, max-age=31536000, immutable` on the path, since the version-as-query-string convention makes the byte response truly immutable per-URL.

A user who replaces their picture sees the new picture on every device immediately, because the next page load pulls `profiles.avatar_version = 7` from PostgREST and renders `?v=7` rather than `?v=6`. There is no service-worker dance and no header negotiation; the cache-key already encodes the version.

For the `avatar_version = 0` case the `<img>` tag is never rendered at all — the `<Avatar>` component branches on the integer and renders the coloured initials disc directly. This is the same fallback as today; the new column doesn't change the fallback path, just the conditional that selects it.

## File lifecycle

The four moments a file at `/srv/cairn/avatars/{uid}.webp` is touched:

1. **Upload.** Sidecar writes the file (atomic rename). Then bumps the row's version. If the row bump fails, the file is orphaned but not visible — `avatar_version = 0` still points the UI at initials. A periodic GC sweep reconciles.
2. **Replace.** Same as upload — the file is overwritten in place. The version bumps. The browser's cache pulls `?v=N+1` and ignores the previous bytes.
3. **Remove.** The web app calls `clear_avatar` (RPC, instant), then calls `DELETE /avatars/me` on the sidecar (best-effort). If the sidecar call fails, the file is orphaned but again invisible — the row's `avatar_version = 0` is the source of truth.
4. **Account deletion.** `delete_account` (see `account-deletion.md`) drops the `auth.users` row and cascades the `profiles` row. The web app then calls `DELETE /avatars/me` on the sidecar to unlink the file. Same best-effort shape; orphan files get swept.

### The orphan sweeper

A small periodic job (cron, every night) walks `/srv/cairn/avatars/`, compares each filename's UUID against the live set of `profiles.id` (live = the row exists *and* `avatar_version > 0`), and unlinks every file that has no matching row. This is the safety net for every "the sidecar call failed" branch above; in steady state it runs and finds nothing to do.

The sweep does *not* need to consult `auth.users` directly — `profiles` cascades from `auth.users`, so a deleted account already implies a missing profile row, which implies an orphan.

## What the user sees

For the full screen flow, see `design/cairn-avatar-screens.jsx`. The high-level shape is:

1. **Settings → Profile chip.** A row at the top of the Settings screen showing the current avatar (initials disc or photo), the display name, and a chevron. Tapping opens **Edit profile**.
2. **Edit profile screen.** A larger avatar at the top with a small **Change** affordance overlaid. Below: the editable display name. Below that: a muted **Remove picture** row, only visible when the user has a picture (`avatar_version > 0`).
3. **Source sheet.** A bottom sheet with **Take photo** and **Choose from library** (and **Cancel**). The sheet uses the platform's native `<input type="file" accept="image/*" capture="user">` for camera and a plain `<input type="file">` for library — no custom permissions handling.
4. **Crop step.** A square viewport on the picked image with a circular crop overlay (so the user sees what the final disc will look like). Pinch/zoom and drag. A **Use this picture** button on the bottom-right; **Cancel** on the bottom-left. The crop is client-side preview only — server re-validates and re-crops.
5. **Upload states.** Five small variants captured on canvas:
   - *Uploading.* Spinner over the avatar slot, **Cancel** button enabled.
   - *Saved.* Brief check-mark flash, then the new picture is in place.
   - *Too big.* Inline error: *"That picture is larger than 8 MB. Try another."*
   - *Wrong format.* Inline error: *"That file isn't a picture we can use."*
   - *No connection.* Inline error: *"Couldn't reach the server. Try again."* The crop step preserves the user's image so they don't have to re-pick.

## What stays unchanged

The Avatar React component already in the design files renders the coloured initials disc as its fallback. `avatar_version = 0` selects the fallback. The deleted-user tombstone gets `avatar_version = 0` permanently and renders as a gray disc with no initials, exactly as `ui.md` already specifies — adding the column doesn't change tombstone rendering at all.

No other table changes. No other RLS policy changes. The trash views, the items_ranked view, the invite RPCs, and the per-list members screen all read `profiles` the same way they do today; they just see one extra integer column and ignore it unless they're rendering an avatar.

## Build order

The smallest useful slice is "upload and replace, no remove yet":

1. `0007_avatars.sql` migration: the column + three RPCs (`bump_avatar_version`, `clear_avatar`, `set_display_name`) + pgTAP coverage on the column default, the increment, the reset, display-name validation, and cross-user isolation.
2. The sidecar: `POST /avatars` only, with magic-byte validation and the resize. Docker-Composed in alongside Caddy.
3. Caddy: the `handle_path /avatars/*` block, read-only mount.
4. The web app: extend the `<Avatar>` component to render `?v=` when `avatar_version > 0`, render the existing initials disc otherwise. The Edit Profile / source sheet / crop / upload-state screens from the design canvas.

Then the rest:

5. **Remove flow.** `clear_avatar` RPC is already in the migration; wire the **Remove picture** row and the sidecar `DELETE /avatars/me`.
6. **Orphan sweeper.** A cron entry calling a small script. Plain `find` + `psql` is enough.
7. **`delete_account` integration.** The web app calls `DELETE /avatars/me` after a successful account delete. See `account-deletion.md` for the integration point.

## Open questions

- **Image format on disk.** WebP is the v1 choice; it's universally supported in 2026 browsers and gives the smallest file at acceptable quality. If we ever need to fall back to JPEG (e.g. for an older client we don't anticipate), the sidecar's resize step is the only thing that has to change — the URL pattern and the row column don't care.
- **Multiple sizes.** v1 ships one size (256²). A retina-conscious 512² variant at `/avatars/{uid}@2x.webp` is straightforward to add later — the sidecar writes both files, the version column covers both, and the URL pattern extends to `?v=N` on each. Not worth doing pre-v1.
- **AVIF.** Smaller than WebP at the same quality, but the encoder is slow and the libheif/libavif surface area is bigger. Re-evaluate post-v1 if avatar disk usage ever matters.
- **Animated avatars.** Explicitly not supported. The sidecar strips animation on resize. If a user uploads a 60-frame GIF, they get the first frame. The product doesn't need animated avatars and the bandwidth implications are awful.
