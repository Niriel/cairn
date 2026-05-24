# Plan: Avatar upload sidecar and Caddy static serving

Sub-plan 0502 in the 0500_avatars feature branch. The DB column and RPCs
shipped in 0501; this plan adds the write path — a minimal Node/TypeScript
sidecar — and the serve path — a Caddy `/avatars/*` block. Together they
form the infrastructure that the 0503 frontend plan wires up.

## Context

The avatar feature is designed as "bytes on disk, version in the row" (see
`docs/avatars.md`). Postgres holds a tiny `avatar_version int` column;
the actual image bytes live in a flat directory at
`/srv/cairn/avatars/{uid}.webp`, served by Caddy. A small sidecar is the
only process with write access to that directory.

The reason for the sidecar is not complexity — the service is under 300 lines
— but isolation: Postgres should not decode untrusted image bytes
(`plpython3u` is untrusted PL/Python and runs in the same process), and
resize libraries (libwebp, libjpeg-turbo, libheif) have a real CVE history
that belongs behind a restart boundary, not inside the database. A sidecar
that crashes and restarts does not take down queries.

The current `docker-compose.yml` (as of 0501) has no Caddy service and no
named avatars volume. This plan adds both, mirroring the production Caddy +
VPS filesystem shape as closely as possible in local dev so the 0503
Playwright tests run against real infrastructure.

## Decisions

**TypeScript + express + sharp + jose + file-type.** The language choice was
made in the parent plan (0500 task 2.1) and is locked in. `sharp` is the
standard Node image-processing library; it binds to `libvips`, which handles
JPEG, PNG, WebP, and HEIC. `jose` is a zero-dependency JWT library that
handles GoTrue's HS256 tokens. `file-type` detects image format from magic
bytes — it is cleaner than writing byte-offset checks by hand and handles
HEIC (ISO BMFF container) without us caring about the ftyp-box structure.
`vitest` is the test runner; it's the same runner the web project uses, so
contributors don't need a second tool.

**Temp file inside the avatars volume, never `os.tmpdir()`.** `fs.rename()`
is only atomic when source and destination are on the same filesystem. If the
temp file lives in `/tmp` (a different mount inside Docker) and the destination
is the avatars volume, the rename crosses filesystems and Node raises `EXDEV`.
We therefore write `{avatarsDir}/{uid}.webp.tmp` — same directory, same
volume. This is the standard pattern for atomic file replacement on Unix and
is explicitly required by the parent plan's Decisions.

**Two independent security gates before resize.** The 8 MB body cap is the
cheap front-line check (no image library involved — just the multipart
parser's `limits.fileSize`). The 4096×4096 decoded-bounds check via
`sharp().metadata()` catches image bombs that are small as bytes but huge as
pixels. Both gates must pass before `sharp` decodes the full pixel data for
resize. See `docs/avatars.md` § "Why the 8 MB cap and the 4096² decoded-bounds
check" for the full rationale.

**Automated vitest+supertest tests for the three security gates (R7).** The
parent plan explicitly rules out "manual curl alone is not a repeatable
regression guard." The tests start the Express app in-process (supertest),
send crafted payloads, and assert the HTTP status codes. Sharp's metadata
function is vi.spyOn'd in the image-bomb test so the test doesn't need a real
4096×4096 pixel image; the wrong-magic-bytes test uses a real buffer with
corrupted header bytes; the body-size test streams a synthetic buffer
larger than 8 MB.

**Caddy in docker-compose for local dev.** Caddy is the production web server;
running it in the dev compose means local dev matches production more closely
and the 0503 Playwright tests can exercise the real avatar-serving path (`GET
/avatars/{uid}.webp?v=N` from Caddy, not a vite-proxy workaround). The Caddy
image is official (`caddy:latest`); the Caddyfile is minimal — just the
`/avatars/*` block. No TLS in local dev (plain `:80`).

**GOTRUE_JWT_SECRET sourced from `${JWT_SECRET}`.** GoTrue, PostgREST, and
the sidecar all share the same HS256 secret. In the compose file it's already
named `JWT_SECRET` in the `.env`. The sidecar's env var is named
`GOTRUE_JWT_SECRET` for clarity. This is documented in `docker-compose.yml`
alongside `POSTGREST_URL` so operators know what to set on the VPS.

## Architecture

### New files

- **`sidecar/package.json`** — dependencies: express, sharp, jose, file-type,
  multer; devDependencies: typescript, vitest, supertest, @types/*.
- **`sidecar/tsconfig.json`** — Node 20 target, strict mode, outDir `dist/`.
- **`sidecar/Dockerfile`** — multi-stage: build stage (`node:20-alpine`) +
  runtime stage (same base, copies `dist/` and `node_modules/`).
- **`sidecar/src/index.ts`** — Express app factory + server start; exports
  `app` for supertest.
- **`sidecar/src/middleware/auth.ts`** — `requireAuth` Express middleware:
  extracts bearer token, calls `jose.jwtVerify`, checks UUID regex, attaches
  `req.uid`.
- **`sidecar/src/routes/healthz.ts`** — `GET /healthz` handler.
- **`sidecar/src/routes/avatars.ts`** — `POST /avatars` and
  `DELETE /avatars/me` handlers; imports `requireAuth` and validation helpers.
- **`sidecar/src/lib/validate.ts`** — pure validation helpers:
  `checkMagicBytes(buffer)`, `checkDecodedBounds(buffer)`. Testable in
  isolation.
- **`sidecar/test/validate.test.ts`** — vitest + supertest security-gate
  tests (R7): wrong magic bytes → 415, image bomb → 422, body > 8 MB → 413.
- **`caddy/Caddyfile`** — Caddy configuration: `@sidecar_writes` method matcher
  + `reverse_proxy sidecar:3001` for POST/DELETE, plus `handle_path /avatars/*`
  file_server for GET with `Cache-Control: immutable` header.

### Modified files

- **`docker-compose.yml`** — add `sidecar` service (read-write avatars volume
  mount), `caddy` service (read-only avatars mount, port 80), and named
  `avatars` volume.
- **`scripts/check.sh`** — add sidecar install + test step after the web unit
  tests.

### Data flow

```
Browser  ──POST /avatars──►  Sidecar ──sharp resize──► avatars/{uid}.webp
                               │
                               └──POST /rpc/bump_avatar_version──► PostgREST ──► Postgres

Browser  ──GET /avatars/{uid}.webp?v=N──►  Caddy ──file_server──► avatars/{uid}.webp
```

The sidecar is the only writer. Caddy is the only reader. Postgres is the
version counter. These three roles are separated by Docker volume mount
permissions (read-write vs read-only) and do not overlap.

## Phase structure

0. **Phase 0 — Reconcile docs.** Edit `docs/architecture.md` Local development parity
   section: the current text says "Caddy is omitted on the laptop" — this plan adds Caddy
   to docker-compose.yml for avatar static serving, which directly contradicts that.
   Landing the doc edit before any code runs ensures executors reading the spec see
   accurate information.

1. **Phase 1 — Sidecar service.** Scaffold the `sidecar/` directory and
   package; implement JWT auth middleware and UUID validation; write
   security-gate tests (RED) and the full `POST /avatars` route (GREEN);
   add `DELETE /avatars/me`; wire sidecar tests into `check.sh`.
   Covers R1–R7, R10.

2. **Phase 2 — Infrastructure wiring.** Update `docker-compose.yml` to add
   the `sidecar` service and named `avatars` volume; create `caddy/Caddyfile`
   and add the `caddy` service to compose. Covers R8–R9.

TDD ordering: all three security-gate tests are RED before the `POST /avatars`
implementation is GREEN. The `GET /healthz` route has no failing-state because
it has no logic; it can be verified with a smoke-assertion in the same task.

## Reference docs and skills

- **`docs/avatars.md`** — authoritative design: sidecar routes, security
  rationale, file lifecycle, cache-busting URL pattern.
- **`docs/architecture.md`** — runtime topology; Caddy as the edge server.
- **`plans/0500_avatars/REQUIREMENTS.md` R5–R6** — parent plan's binding
  requirements for this sub-plan.
- **`plans/0500_avatars/TASKS.md` task 2.1 Decisions** — locked-in choices
  (language, UUID check, temp-file placement, env vars).
