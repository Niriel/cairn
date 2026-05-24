# Requirements: Avatar upload sidecar and Caddy static serving

Step 5 sub-plan 0502: add the Node/TypeScript upload sidecar and wire Caddy
to serve the resulting files. This is the write path for all avatar uploads;
the web-app frontend (0503) can't integrate until this sidecar is running and
reachable. The DB contract (`bump_avatar_version`, `clear_avatar`,
`set_display_name`) shipped in 0501 and is the only prerequisite here.

## R1. Sidecar package scaffold

A `sidecar/` directory at the repo root contains a TypeScript Node service
with `express` for HTTP, `sharp` for image processing, `jose` for JWT
verification, and `file-type` for magic-byte detection. The service has its
own `package.json`, `tsconfig.json`, `Dockerfile`, and `pnpm` lockfile. The
test runner is `vitest`; tests live in `sidecar/test/`.

## R2. GET /healthz route

The sidecar exposes `GET /healthz` which returns HTTP 200 and the JSON body
`{ "ok": true }`. Used as the Docker healthcheck endpoint.

## R3. JWT bearer-token verification

Every route except `GET /healthz` requires a valid GoTrue JWT in the
`Authorization: Bearer <token>` header. Verification uses `jose`'s
`jwtVerify` against the `GOTRUE_JWT_SECRET` environment variable (shared
secret, HS256). Requests with no header, an expired token, or a bad signature
receive HTTP 401.

The `sub` claim (the authenticated user's UUID) is extracted from the verified
token payload and made available to the route handlers as `req.uid`.

## R4. UUID validation before file-path construction

After JWT verification, `req.uid` is checked against the RFC 4122 pattern
`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
before any filesystem path is constructed. If the claim fails this check, the
sidecar rejects with HTTP 400. This is defence-in-depth: GoTrue signs the
token, but the sidecar must not trust claim values for filesystem operations
without validation.

## R5. POST /avatars route — security-gated upload

`POST /avatars` accepts `multipart/form-data` with a single `file` field
(the image). The following checks are performed in order; the first failure
returns the listed status:

- **8 MB request-body cap** — enforced by the multipart parser; excess
  triggers HTTP 413.
- **Magic-byte check** — `file-type` detects the actual format from the first
  bytes of the buffer. If the detected MIME type is not one of `image/jpeg`,
  `image/png`, `image/webp`, `image/heic`, the request is rejected with HTTP 415.
  The `Content-Type` header is not checked separately — magic-byte detection is
  the sole format gate (the header is untrusted and could be spoofed).
- **Decoded pixel bounds** — `sharp(buffer).metadata()` must report
  `width <= 4096 && height <= 4096`. Exceeding either dimension (an image
  bomb) → HTTP 422.

When all checks pass:
1. Resize to 256×256 WebP at quality 80 using `sharp`.
2. Write the result to `{avatarsDir}/{uid}.webp.tmp`, then atomically rename
   to `{avatarsDir}/{uid}.webp`. The temp file lives inside the avatars
   directory (the Docker volume) — never in `os.tmpdir()` or any path
   outside the volume, so the rename is within one filesystem and is atomic.
3. Call `POST /rpc/bump_avatar_version` on PostgREST (`POSTGREST_URL` env
   var, e.g. `http://postgrest:3000`) with the user's bearer token.
4. Return HTTP 200 and `{ "version": <n>, "url": "/avatars/{uid}.webp?v=<n>" }`.

The original bytes are discarded the moment the resize completes — only the
~10 KB WebP is kept on disk.

## R6. DELETE /avatars/me route

`DELETE /avatars/me` unlinks `/avatars/{uid}.webp`. The route is best-effort:
if the file does not exist the response is still HTTP 200. This route is
called by the web app after `clear_avatar()` RPC succeeds, and after account
deletion.

## R7. Automated security-gate tests

`sidecar/test/validate.test.ts` (vitest + supertest) covers the three
load-bearing security gates from R5:

- **(a) Wrong magic bytes** — a buffer with a `.jpg` extension but non-JPEG
  magic bytes is rejected with HTTP 415.
- **(b) Image bomb** — a valid image whose `sharp` metadata reports
  dimensions larger than 4096 in either axis is rejected with HTTP 422.
  (Sharp can be mocked in the test to return synthetic metadata without
  needing a real 4096×4096 image.)
- **(c) Body > 8 MB** — a multipart body exceeding 8 MB is rejected with
  HTTP 413.

These tests run via `pnpm test` inside `sidecar/` and are called from
`./scripts/check.sh` so they are part of the CI gauntlet.

## R8. Docker Compose wiring — sidecar service and named volume

`docker-compose.yml` gains:

- A `sidecar` service built from `./sidecar/Dockerfile`, with environment
  variables `GOTRUE_JWT_SECRET` (sourced from `${JWT_SECRET}`, the same
  value PostgREST and GoTrue use), `POSTGREST_URL: http://postgrest:3000`,
  `AVATARS_DIR: /srv/cairn/avatars`, and `PORT: "3001"`. The service mounts
  the named `avatars` volume at `/srv/cairn/avatars` read-write and depends on
  `postgrest` being healthy.
- A named `avatars` volume in the top-level `volumes:` section.

## R9. Caddy /avatars routing — write proxy and static serving

`caddy/Caddyfile` (created) uses two distinct matchers on the `/avatars`
prefix (as specified in `plans/0500_avatars/PLAN.md`):
1. A named method matcher `@sidecar_writes { method POST DELETE; path /avatars* }`
   with a `reverse_proxy sidecar:3001` directive — routes upload and delete
   requests to the sidecar.
2. A `handle_path /avatars/*` block with `file_server` that sets
   `Cache-Control: public, max-age=31536000, immutable` — serves static WebP
   files for GET requests. The `?v=` query string makes each version URL
   effectively immutable, so the long cache header is correct.

A single `handle_path /avatars/*` block cannot serve both roles: `file_server`
returns 405 for POST and DELETE.

`docker-compose.yml` gains a `caddy` service using the official `caddy`
image, mounting `./caddy/Caddyfile` and the `avatars` volume read-only at
`/srv/cairn/avatars`. Caddy is exposed on port 8080 on the host (→ container
port 80).

## R10. check.sh integration

`scripts/check.sh` gains a `sidecar: install + test` step (after the web
tests) that runs `cd sidecar && pnpm install --frozen-lockfile && pnpm test`
and reports `ok` / `FAIL` in the same style as the other steps.

## Non-requirements (explicitly excluded)

- **GoTrue token issuance** — the sidecar verifies tokens but does not issue
  them; that stays with GoTrue.
- **Image serving from the sidecar** — the sidecar is write-only; Caddy
  serves the bytes (R9). The sidecar has no `GET /avatars/*` route.
- **Multiple avatar sizes** — one 256² file per user; retina variant is
  deferred to post-v1 per `docs/avatars.md`.
- **AVIF output** — WebP at quality 80 is the v1 format; AVIF encoder is
  slow and the libavif attack surface is larger.
- **delete_account integration** — the web app's `DELETE /avatars/me` call
  after account deletion is wired in step 9 (account deletion plan). The
  sidecar just needs to exist and respond.
- **Orphan sweeper** — the nightly cron script that reconciles the avatars
  directory with live profile rows is in scope for 0503 (frontend sub-plan)
  because it needs the full feature to be meaningful.
- **Content-Type header pre-filter** — the `Content-Type` request header is not
  validated separately from the magic-byte check. Magic-byte detection via
  `file-type` is the sole format gate; it is strictly more reliable than trusting
  a header the client controls.
