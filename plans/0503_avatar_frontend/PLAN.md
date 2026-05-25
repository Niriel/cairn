# Plan: Avatar frontend (0503)

Sub-plan of `0500_avatars`, Phase 3. Prerequisites: `0501_avatar_db` and
`0502_avatar_sidecar` are merged into `0500_avatars`. This plan covers R7–R12
(the UI half), implemented on branch `0503_avatar_frontend` cut from
`0500_avatars`.

## Decisions

**In-page view-state machine for the upload flow (R9).** A single `viewState`
variable in `/profile/+page.svelte` drives which full-screen content is shown:
`'edit' | 'cropping' | 'uploading' | 'success' | 'too-big' | 'wrong-format' |
'network'`. This avoids the complexity of inter-route state sharing (passing a
picked image File across route boundaries) and keeps the upload flow contained
in one file. `AvatarSourceSheet` and `AvatarCropScreen` are components rendered
within the profile route; they are NOT sub-routes.

**Native pointer events for crop (R9).** The `AvatarCropScreen` component
implements drag (panX, panY) and pinch/scroll-to-zoom using `pointermove`,
`pointerup`, `touchstart`, and `wheel` event listeners directly on the crop
canvas element. No external gesture library is added to `web/package.json`.
Estimated ~80 lines of interaction code.

**Avatar component is Cairn-aware but visually self-contained (R7).** `uid` and
`avatarVersion` are optional props (defaults `''` and `0`) so existing callers
compile before they're updated. All three callers plus the test and mock are
updated in the same task.

**Profile store exposes `uid` from session (R7).** The session store already
holds the signed-in user's `id`. The profile store reads `uid` from the session
rather than from the PostgREST query, and stores it alongside `displayName` and
`avatarVersion`. This avoids a redundant DB round-trip and keeps the store
shape simple.

**Data type extension for list members and vote rows (R7).** The `List` type's
`list_members` array gains `user_id: string` and `profiles.avatar_version:
number`. The `VoteRow.profile` gains `avatar_version: number`. The `fetchItems`
and `lists.svelte.ts` queries are updated to include these fields.

**Toolchain ordering: profile route stub first (R8).** Task 0.1 creates a
minimal `/profile/+page.svelte` stub before any task adds `goto(resolve(
'/profile'))` to `settings/+page.svelte`. SvelteKit's `resolve()` rejects
unknown route IDs at type-check time. Stub lands in Phase 0; navigation lands
in Phase 2.

**Vite proxy for `/avatars` (R9, dev only).** A `/avatars` proxy entry in
`vite.config.ts` forwards all avatar requests to Caddy on `localhost:8080`.
For POST and DELETE methods, it injects `Authorization: Bearer <jwt>` from
the `cairn_session` cookie, mirroring the `/api` proxy pattern. This is added
in task 4.1 alongside the upload wiring. In production, the Caddy site block
(configured in step 13) handles the same cookie-to-bearer translation for
sidecar-bound writes.

**UploadingState back arrow disabled during active upload (R9, R9 spec note).**
When `viewState === 'uploading'`, the TopBar back arrow renders as `disabled`
with `pointer-events: none`. For `success` and error states (`too-big`,
`wrong-format`, `network`), the TopBar uses a custom `left` snippet (not
`showBack`) with an onclick that sets `viewState = 'edit'`. Using `showBack`
here would call `history.back()` and navigate away from `/profile`, because
the AvatarSourceSheet's history guard entry was already cleaned up when the
viewState transitioned away from `'edit'`. The design JSX renders the back
arrow without a disabled state — R9 is authoritative. **Note on parent R9:**
Parent R9 originally said the back arrow on error states goes "back to the
file picker." This sub-plan deviates: the back arrow on error states sets
`viewState = 'edit'` (not `showSourceSheet = true`). The action button
("Choose another") reopens the source sheet; the back arrow does not —
re-opening requires an explicit `showSourceSheet = true`, which the action
button does but a generic back arrow cannot. Parent R9 has been updated to
reflect this.

**AvatarSourceSheet pushes history (R9).** Per `docs/ui.md`, dismissible
overlays push a history entry on open and listen for `popstate` to close.
`AvatarSourceSheet` uses `pushHistoryGuard` from `back-stack.svelte.ts`.

## Component paths

| Component | Path |
|---|---|
| `<Avatar>` | `web/src/lib/shared/components/Avatar.svelte` |
| `AvatarSourceSheet` | `web/src/lib/avatar/components/AvatarSourceSheet.svelte` |
| `AvatarCropScreen` | `web/src/lib/avatar/components/AvatarCropScreen.svelte` |
| Profile route | `web/src/routes/(app)/profile/+page.svelte` |
| Profile route test | `web/src/routes/(app)/profile/page.test.ts` |
| Orphan sweeper | `scripts/sweep-avatars.sh` |
| Crontab example | `crontab.example` |
| Playwright spec | `web/e2e/avatar.spec.ts` |

## Upload data flow (dev)

```
Browser (Vite dev server / port 5173)
  │ POST /avatars (multipart, no JS-readable auth)
  ▼
Vite proxy (injects Authorization: Bearer from cairn_session cookie)
  ▼
Caddy (localhost:8080 — reverse_proxy @sidecar_writes to sidecar:3001)
  ▼
Sidecar (verifies JWT, validates, resizes, writes file, bumps version)
  └── returns { version, url }
Browser updates profile store avatarVersion → re-renders <Avatar>
```

## MSW handler updates

The existing `*/api/profiles` handler returns `{ display_name: 'Alice' }`. It
must be updated to also return `avatar_version: 0` so the profile store test
and component tests that rely on this handler don't break.

## Phase structure

0. **Foundation** — profile store update + route stub (R7 store half).
1. **Avatar component** — photo branch + all callers (R7 component half).
2. **Settings navigation** — chip → `/profile` (R8 prerequisite).
3. **Avatar pickers** — AvatarSourceSheet + AvatarCropScreen (R9 components).
4. **Edit Profile screen** — full implementation incl. remove flow + Vite proxy (R8, R9, R10, R12).
5. **Orphan sweeper** (R11).
6. **Playwright e2e** (R7–R10).
