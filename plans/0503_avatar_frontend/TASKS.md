# Tasks

## Reference skills and docs

- **`plans/0503_avatar_frontend/PLAN.md`** — architectural decisions (view-state machine, crop impl, data flow).
- **`plans/0503_avatar_frontend/REQUIREMENTS.md`** — R7–R12 UI scope.
- **`docs/avatars.md`** — storage decisions, cache-busting URL, sidecar routes, file lifecycle.
- **`docs/ui.md`** — TopBar spec, button order, back-stack pattern, fixed-position CSS patterns.
- **`docs/frontend-layout.md`** — tier split (basic/shared/domain), filename conventions, mock rules.
- **`design/cairn-avatar-screens.jsx`** — visual spec for every screen in this plan.

---

## Phase 0 — Foundation

### [x] 0.1 Profile store update + `/profile` route stub

**Created:** 2026-05-25T00:00:00Z
**Completed:** 2026-05-25T07:25:26Z

**Why:** Two things must land before any other task can proceed. First, the profile
store must fetch and expose `avatar_version` and `uid` — downstream tasks read
these. Second, the `/profile` route stub must exist before task 2.1 adds
`goto(resolve('/profile'))` to SettingsScreen; SvelteKit's `resolve()` rejects
unknown route IDs at type-check time.

**Prerequisites:** Branch `0503_avatar_frontend` exists and is checked out.

**Decisions:**
- Profile store state shape: `{ uid: string | null; displayName: string | null; avatarVersion: number }`.
  `uid` is set from `session.current.user.id` when signed in; not from the DB
  query (we already have it). `avatarVersion` comes from the DB query; defaults
  to `0`.
- PostgREST query changes from `select=display_name` to
  `select=display_name,avatar_version`.
- Profile mock (`__mocks__/profile.svelte.ts`) gets the same three fields.
- The `/profile/+page.svelte` stub is one paragraph — just enough for SvelteKit
  to register the route. It will be replaced in task 4.1.
- MSW handler `*/api/profiles` must return `avatar_version: 0` alongside
  `display_name: 'Alice'` so tests using that handler don't break.

**Files:**
- `web/src/lib/shared/state/profile.svelte.ts` (modify)
- `web/src/lib/shared/state/__mocks__/profile.svelte.ts` (modify)
- `web/src/lib/shared/state/profile.test.ts` (modify — add avatarVersion test)
- `web/src/lib/test/handlers.ts` (modify — add avatar_version to profiles response)
- `web/src/routes/(app)/profile/+page.svelte` (create, stub)

**Steps:**
1. **RED** — Add a test to `profile.test.ts` (after the existing tests) asserting
   that after sign-in, `profile.avatarVersion` equals `0` and `profile.uid`
   equals the test UID. Run `pnpm test` and confirm the new assertions fail.
2. Update `profile.svelte.ts`:
   - State shape: `$state<{ uid: string | null; displayName: string | null; avatarVersion: number }>({ uid: null, displayName: null, avatarVersion: 0 })`.
   - In the signed-in branch: set `profile.uid = s.user.id`, change the fetch to
     `select=display_name,avatar_version`, set `profile.displayName = result.display_name`
     and `profile.avatarVersion = result.avatar_version`.
   - In the signed-out branch: set all three fields to their zero values.
3. Update `__mocks__/profile.svelte.ts` to match the new state shape.
4. Update `web/src/lib/test/handlers.ts`: change the `*/api/profiles` response
   body from `{ display_name: 'Alice' }` to
   `{ display_name: 'Alice', avatar_version: 0 }`.
5. Create `web/src/routes/(app)/profile/+page.svelte` with minimal content (a
   `<p>Edit profile</p>` stub — no script block needed).
6. **GREEN** — Run `pnpm test` and confirm the new profile store tests pass.

**Verify:** `pnpm lint && pnpm check && pnpm test`

---

## Phase 1 — Avatar component

### [x] 1.1 `<Avatar>` photo branch + all callers

**Created:** 2026-05-25T00:00:00Z
**Completed:** 2026-05-25T07:40:29Z

**Why:** The photo branch must be live before the Edit Profile screen can display
an actual avatar photo. All three existing callers (SettingsScreen, ListsScreen,
ItemsScreen) must be updated in the same commit so they compile with the new
optional props. The data model types for list members and vote rows gain
`avatar_version` so those callers have the data to pass.

**Prerequisites:** Task 0.1 done (profile store exposes `uid` and `avatarVersion`).

**Decisions:**
- New Avatar props (optional, backward-compatible): `uid?: string` (default `''`),
  `avatarVersion?: number` (default `0`). When both are their defaults (or
  `avatarVersion === 0`), the initials disc renders as today.
- Photo branch: `avatarVersion > 0 && uid` → `<img
  src="/avatars/{uid}.webp?v={avatarVersion}" alt="" ...style>`. The `<img>`
  shares the same outer shape (same border-radius / size) as the initials disc.
  Add `loading="lazy"` for performance.
- `List.list_members` gains `user_id: string` (from the join row) and
  `profiles.avatar_version: number`.
- `lists.svelte.ts` query: change `list_members(profiles(display_name))` to
  `list_members(user_id,profiles(display_name,avatar_version))`.
- `VoteRow.profile` gains `avatar_version: number`. `Item.member_votes` gains
  `avatar_version: number`. The votes PostgREST query in `fetchItems` adds
  `avatar_version` to the profile embed.
- SettingsScreen passes `uid={profile.uid ?? ''}` and
  `avatarVersion={profile.avatarVersion}`.
- ListsScreen passes `uid={m.user_id}` and
  `avatarVersion={m.profiles.avatar_version}`.
- ItemsScreen passes `uid={mv.user_id}` and `avatarVersion={mv.avatar_version}`.

**Files:**
- `web/src/lib/shared/components/Avatar.svelte` (modify)
- `web/src/lib/shared/components/Avatar.test.ts` (modify — add photo-branch tests)
- `web/src/lib/shared/components/__mocks__/Avatar.svelte` (modify — add new props)
- `web/src/lib/list/model/list.ts` (modify — add user_id + avatar_version)
- `web/src/lib/list/state/lists.svelte.ts` (modify — extend query)
- `web/src/lib/item/model/item.ts` (modify — add avatar_version to VoteRow.profile + Item.member_votes)
- `web/src/lib/item/model/item.test.ts` (modify — update STUB_VOTE.profile fixture)
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify — pass uid + avatarVersion)
- `web/src/lib/list/components/ListsScreen.svelte` (modify — pass uid + avatarVersion)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify — pass uid + avatarVersion)

**Steps:**
1. **RED** — Add two tests to `Avatar.test.ts`:
   - `(g) avatarVersion > 0 with uid renders img with correct src` — render
     Avatar with `displayName="Alice", uid="abc", avatarVersion=3`; assert the
     rendered element is an `<img>` with `src="/avatars/abc.webp?v=3"`.
   - `(h) avatarVersion 0 renders initials (no img)` — render Avatar with
     `displayName="Alice", uid="abc", avatarVersion=0`; assert no `<img>` exists
     and text content is `'A'`.
   Run `pnpm test`; the new tests must fail (Avatar ignores uid/avatarVersion).
2. Update `Avatar.svelte`:
   - Add optional props `uid` (default `''`) and `avatarVersion` (default `0`).
   - Derived: `const showPhoto = $derived(avatarVersion > 0 && uid.length > 0)`.
   - Template: `{#if showPhoto}<img ...>{:else}<span ...>{text}</span>{/if}`.
   - The `<img>` uses the same `width`/`height` inline styles as the `<span>`
     and `border-radius: 50%`.
3. Update `__mocks__/Avatar.svelte` to accept and ignore the new props.
4. Update `List` type in `list.ts` → add `user_id: string` to list_members shape
   and `avatar_version: number` to profiles shape.
5. Update `lists.svelte.ts` query to include `user_id` and `avatar_version`.
6. Update `VoteRow.profile` in `item.ts` to add `avatar_version: number`. Update
   `Item.member_votes` to add `avatar_version: number`. Update the votes
   PostgREST query in `fetchItems` to include `avatar_version` in the profile
   embed. In `item.test.ts`, add `avatar_version: 0` to the `profile` field of
   `STUB_VOTE` (line 26) so it satisfies the updated `VoteRow` type. Also update
   the `member_votes` map at the bottom of `fetchItems` (currently `item.ts:82`)
   to include `avatar_version: v.profile?.avatar_version ?? 0` alongside
   `display_name`, so the flattened array actually carries the new field.
7. Update `SettingsScreen.svelte`, `ListsScreen.svelte`, `ItemsScreen.svelte`
   to pass the new props.
8. **GREEN** — Run `pnpm test`; all Avatar tests must pass including (g) and (h).

**Verify:** `pnpm lint && pnpm check && pnpm test`

**Notes:** Extracted the inline `member_votes` object shape on `Item` into a named `MemberVote` type (exported from `item.ts`) to make the type easier to follow. No behaviour change.

---

## Phase 2 — Settings navigation

### [x] 2.1 Settings profile chip navigation

**Created:** 2026-05-25T00:00:00Z
**Completed:** 2026-05-25T07:56:46Z

**Why:** The chip must navigate to `/profile` before the Edit Profile screen is
useful. Wiring navigation here (after the route stub exists from task 0.1)
keeps the change small and independently testable.

**Prerequisites:** Tasks 0.1 (route stub exists at `/profile`) and 1.1 (Avatar component accepts `uid`/`avatarVersion` props) done.

**Decisions:**
- The entire profile chip (avatar + display name + chevron) becomes a single
  `<button>` per `docs/ui.md` → "Row navigation pattern".
- `onclick`: `goto(resolve('/profile'))`.
- `data-test="profile-chip"` on the button so tests can click it.
- A `>` chevron icon is added trailing the display name (per design).

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)

**Steps:**
1. **RED** — Add a test `(i) clicking profile chip navigates to /profile`:
   mock `$app/navigation` (`vi.mock('$app/navigation')`), render SettingsScreen
   with `profile.displayName = 'Alice'`, click `data-test="profile-chip"`,
   assert `goto` was called with `resolve('/profile')` (or at minimum was
   called once). Run `pnpm test`; the test must fail.
2. Update `SettingsScreen.svelte`:
   - Wrap the profile chip contents in a `<button class="profile-chip"
     data-test="profile-chip" onclick={...}>`.
   - Import `goto` from `$app/navigation` and `resolve` from `$app/paths`.
   - Add a trailing `<Icon name="chevron-right" size={18} />`.
   - Pass `uid={profile.uid ?? ''}` and `avatarVersion={profile.avatarVersion}`
     to the Avatar inside the chip (already updated in task 1.1).
3. **GREEN** — Run `pnpm test`; all SettingsScreen tests must pass.

**Verify:** `pnpm lint && pnpm check && pnpm test`

**Notes:** Two visual fixes beyond the task spec: (1) the skeleton div was missing its `16px 18px` padding after the section class was renamed from `profile-chip` to `profile-chip-section`; (2) added `border-bottom: 1px solid var(--rule)` to the section to visually separate the chip from the preference groups below.

---

## Phase 3 — Avatar pickers

### [x] 3.1 `AvatarSourceSheet` and `AvatarCropScreen` components

**Created:** 2026-05-25T00:00:00Z
**Completed:** 2026-05-25T09:31:21Z

**Why:** These components must exist (with mocks) before task 4.1 can import and
test them in the profile route. Landing them independently keeps each task
testable in isolation.

**Prerequisites:** None beyond the branch.

**Decisions:**
- Create `web/src/lib/avatar/components/` (new domain directory).
- **AvatarSourceSheet props:** `onfile: (file: File) => void`, `oncancel: () =>
  void`. Two hidden `<input type="file">` elements: one with `capture="user"`
  (camera), one without (library). Clicking the corresponding row triggers
  `.click()` on the input. `Sheet.svelte` handles the history guard internally
  via its `open` prop — `AvatarSourceSheet` does **not** call
  `pushHistoryGuard` separately.
- **AvatarCropScreen props:** `imageFile: File`, `oncancel: () => void`, `onsave:
  (blob: Blob | null) => void`. `null` signals a crop failure (tainted canvas or
  browser refusal); the parent maps this to `viewState = 'wrong-format'`. Renders a full-screen view (its own TopBar with title
  "Crop" and a Save button, back arrow calls `oncancel`). The image is drawn
  on a canvas. Drag (`pointermove` while pointer is down) adjusts `panX`/`panY`.
  Two-finger touch (`touchstart` with 2 touches, `touchmove`) adjusts `scale`.
  `wheel` also adjusts `scale`. Saving: draw the scaled/translated image onto
  an off-screen 256×256 canvas, call `canvas.toBlob('image/jpeg', 0.9)`, pass
  the blob to `onsave`.
- Visual spec for AvatarSourceSheet (inlined from `cairn-avatar-screens.jsx` so
  this task is self-contained): Sheet panel `borderTopLeftRadius: 24,
  borderTopRightRadius: 24`, `padding: '22px 0 28px'`. Drag handle: `width: 36,
  height: 4`, `borderRadius: 99`, `background: var(--stone-lt)`,
  `margin: '0 auto 14px'`. Header: `padding: '0 22px 14px'`,
  `borderBottom: 1px solid var(--rule)`. Title: Newsreader `18px` weight `500`.
  Subtitle: `12px`, `var(--stone)`, `marginTop: 2`; text: "A photo, doodle, or
  anything else · JPG, PNG, WebP, or HEIC · up to 8 MB". Rows:
  `padding: '14px 22px'`, `gap: 14`, icon `size=18 strokeWidth=1.75`, label
  `fontSize: 15 fontWeight: 500`. Separator after each row except the last:
  `borderBottom: 1px solid var(--rule)`. Cancel row colour: `var(--stone)`.
- Visual spec for AvatarCropScreen: `cairn-avatar-screens.jsx` →
  `AvatarCropScreen` (dark bg, 320×320 crop stage, circular overlay at ~280 px
  diameter, corner hints, preview row at bottom, hint text).
- Mocks for both components render a minimal stub that exposes `data-test`
  attributes matching what the profile route test will query.

**Files:**
- `web/src/lib/avatar/components/AvatarSourceSheet.svelte` (create)
- `web/src/lib/avatar/components/AvatarSourceSheet.test.ts` (create)
- `web/src/lib/avatar/components/__mocks__/AvatarSourceSheet.svelte` (create)
- `web/src/lib/avatar/components/AvatarCropScreen.svelte` (create)
- `web/src/lib/avatar/components/AvatarCropScreen.test.ts` (create)
- `web/src/lib/avatar/components/__mocks__/AvatarCropScreen.svelte` (create)

**Steps:**
1. **RED** — Write `AvatarSourceSheet.test.ts`:
   - `(a)` renders "Take photo" and "Choose from library" rows.
   - `(b)` Cancel row calls `oncancel`.
   - `(c)` selecting a file via the library `<input>`'s `change` event calls
     `onfile(file)`. Dispatch a synthetic `change` event on the library input
     (query by `accept="image/*"` without `capture`) with `Object.defineProperty`
     or `fireEvent.change(input, { target: { files: [fakeFile] } })`; assert
     `onfile` was called with that file.
   - Run `pnpm test`; tests must fail (file doesn't exist yet).
2. Implement `AvatarSourceSheet.svelte`:
   - Uses `Sheet.svelte` from `basic/components/` as the panel wrapper. Pass
     `open={true}` and `onclose={oncancel}`. `Sheet.svelte` calls
     `pushHistoryGuard` internally — do **not** add a second call.
   - Two hidden file inputs (camera + library). Row buttons call `.click()` on
     the input. On input `change`, call `onfile(e.target.files[0])` and close.
   - Cancel row calls `oncancel`.
   - Style per design JSX: drag handle, title, subtitle, rows with icons.
3. Create `__mocks__/AvatarSourceSheet.svelte` — stub that renders
   `<div data-test="avatar-source-sheet">` with buttons for "camera" and
   "library" and "cancel" with `data-test` attributes.
4. **RED** — Write `AvatarCropScreen.test.ts`:
   - Before all tests, add:
     `vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob([], { type: 'image/jpeg' })))`
     so happy-dom's null-returning `toBlob` is replaced with one that produces a
     real Blob. Without this, the null-blob path calls `onsave(null)` and test (c)
     would fail.
   - `(a)` renders a canvas element.
   - `(b)` Cancel button calls `oncancel`.
   - `(c)` Save button calls `onsave` with a non-null Blob.
   - `(d)` when `toBlob` calls back with `null` (override the spy to pass `null`
     for this test only), `onsave(null)` is called instead of `oncancel`.
   - Run `pnpm test`; tests must fail.
5. Implement `AvatarCropScreen.svelte`:
   - Full-screen layout with TopBar (title "Crop", back=oncancel, right=Save
     button). The Save button must carry `data-test="crop-save"` so Vitest
     and Playwright can locate it by selector.
   - A `<canvas>` element for the crop viewport (320×320 dark bg, circular
     overlay).
   - On mount: load `imageFile` via `URL.createObjectURL`, draw on canvas.
   - Pointer events on the canvas: `pointerdown` → start drag; `pointermove` →
     update `panX`/`panY`; `pointerup` → end drag.
   - Touch events: register via `$effect(() => { const el = canvasEl; const onTS =
     (e) => { e.preventDefault(); /* record pinch */ }; const onTM = (e) => {
     e.preventDefault(); /* update scale */ }; el.addEventListener('touchstart',
     onTS, { passive: false }); el.addEventListener('touchmove', onTM, { passive:
     false }); return () => { el.removeEventListener('touchstart', onTS);
     el.removeEventListener('touchmove', onTM); }; })`. The `{ passive: false }`
     flag is **required** — Svelte 5 element bindings (`ontouchstart`) are passive
     by default and cannot call `preventDefault()`; without this flag the native
     pinch-to-zoom gesture is not suppressed.
   - `wheel` event: adjust `scale` (with min/max clamp: 0.5–4).
   - Save handler: create 256×256 off-screen canvas, draw clipped region, call
     `canvas.toBlob((blob) => { onsave(blob); }, 'image/jpeg', 0.9)`. The
     callback is the **first** argument to `toBlob` (not third). Pass `null`
     as-is when the blob is null (canvas tainted or browser refusal); the parent
     maps `onsave(null)` to `viewState = 'wrong-format'`. Do **not** call
     `oncancel()` for null — that would silently bounce the user to the edit view
     with no explanation.
   - Preview row at bottom: three Avatar-sized previews at 16/28/44 px using the
     same canvas blob URL.
   - Hint text (two lines, `font-size: 13`, `color: var(--stone)`, centred):
     "Drag to position. Pinch to zoom." / "We'll save it as a 256 × 256 square
     — small, fast, and easy to back up."
6. Create `__mocks__/AvatarCropScreen.svelte` — stub that renders
   `<div data-test="avatar-crop-screen">` with a Save and Cancel button.
7. **GREEN** — Run `pnpm test`; all AvatarSourceSheet and AvatarCropScreen tests
   must pass.

**Verify:** `pnpm lint && pnpm check && pnpm test`

---

## Phase 4 — Edit Profile screen

### [x] 4.1 Full Edit Profile screen (R8, R9, R10, R12) + Vite `/avatars` proxy

**Created:** 2026-05-25T00:00:00Z
**Completed:** 2026-05-25T09:50:59Z

**Why:** This task replaces the stub from 0.1 with the full implementation. It is
intentionally last in the component sequence so AvatarSourceSheet and
AvatarCropScreen mocks already exist for the route test.

**Prerequisites:** Tasks 0.1, 1.1, 2.1, 3.1 all done.

**Decisions:**
- `viewState: 'edit' | 'cropping' | 'uploading' | 'success' | 'too-big' |
  'wrong-format' | 'network'` drives which content the route renders. The
  TopBar title and left/right slots change per state.
- `showSourceSheet = $state(false)` controls AvatarSourceSheet visibility.
  It is separate from `viewState` because the source sheet is an overlay on
  the edit view, not a full-screen state. "Change/Add picture" sets it `true`;
  the sheet's `oncancel` and `onfile` callbacks set it `false`. "Choose another"
  (on `too-big` and `wrong-format` error states) sets `viewState = 'edit'` AND
  `showSourceSheet = true`.
- `pendingFile = $state<File | null>(null)` — the raw `File` from AvatarSourceSheet,
  passed to AvatarCropScreen as `imageFile`. Set when `onfile` fires.
- `pendingBlob = $state<Blob | null>(null)` — the JPEG `Blob` from AvatarCropScreen's
  `onsave` callback. Set before transitioning to `'uploading'`. Must survive the
  `uploading → network` cycle: the "Try again" action re-posts `pendingBlob` directly
  (skipping the crop step). Do **not** conflate with `pendingFile` (the raw picked file)
  — the blob is the cropped output, not the source input.
- **`data-test` attributes on profile route markup** (agreed across this task and task 6.1):
  `"remove-avatar"` on the Remove button; `"change-picture"` on the Change/Add picture
  button; `"display-name-input"` on the display-name `<input>`; `"save-profile"` on the
  TopBar Save button; `"upload-state"` on the root div wrapping each non-edit,
  non-cropping view state (uploading / success / error).
- **Edit view** (R8 visual spec from `EditProfileScreen` in design JSX):
  - Padding: 24 px top / 18 px sides.
  - Avatar 112 px, centred. Below: pill buttons in a row with 8 px gap.
  - Change/Add picture button: `border: 1px solid var(--ink)`, border-radius 99,
    13 px, weight 600, pencil icon 13 px, gap 6 px.
  - Remove button (shown only when `avatar_version > 0`): `border: 1px solid
    var(--rule)`, `color: var(--ember)`, border-radius 99, 13 px, weight 600.
  - Display name label: 11.5 px, weight 600, uppercase, letter-spacing 0.06 em,
    `var(--stone)`, margin-top 28 px.
  - Display name input: 16 px, `border: 1px solid var(--ink)`, border-radius 12,
    padding 12/14 px. Hint below: 12 px, `var(--stone)`.
  - Info box below input: `background: var(--paper-alt)`, `border: 1px solid var(--rule)`,
    border-radius 12, padding 12/14, 12 px, `var(--ink-soft)`.
  - TopBar: Cancel (× icon as left slot, calls `history.back()`), Save (right slot
    pill button, `background: var(--ink) color: var(--paper)`, 13 px, weight 600).
  - Save action: `let nameError = $state<string | null>(null)`. On each Save click,
    set `nameError = null`, then call `pgPost('/rpc/set_display_name', { new_name:
    value.trim() })`. On `23514` error: set `nameError = 'Name can't be blank'`
    when the trimmed value is empty; `nameError = 'Name must be 100 characters or
    fewer'` for a non-blank 23514 (name too long). Render `nameError` as a
    `<p class="field-error">` between the input and the hint text (same slot as the
    hint, shown instead of or below it). On success: set `nameError = null`, update
    `profile.displayName`, call `history.back()`.
- **Uploading state** (design JSX → `UploadingState`): TopBar title "Profile
  picture", back arrow rendered disabled (`pointer-events: none; opacity: 0.4`).
  Central disc 88 px, `background: var(--paper-alt)`, colour `var(--stone)`, icon
  feather 36 px, blinking animation. Title "Uploading…" Newsreader 24/500/−0.01em.
  Subtitle 14 px, `var(--ink-soft)`. Cancel button `background: var(--ink)`;
  clicking Cancel sets `viewState = 'edit'`. The in-flight fetch is **not**
  aborted (AbortController is out of scope for v1); if the upload completes
  after Cancel, `profile.avatarVersion` updates silently (acceptable — the
  user can remove later).
- **Success state**: disc `background: var(--sage-bg)`, `color: var(--sage)`,
  check icon. Title "Saved". Subtitle "Your picture will show up next to your name
  everywhere." Done button → sets `viewState = 'edit'` only (store was already
  updated by the upload `.then()` handler — see "Upload request" below).
- **Error states** (`too-big`, `wrong-format`, `network`): disc
  `background: var(--ember-bg)`, `color: var(--ember)`, × or slash icon. Titles
  per design JSX. `too-big` action → re-open source sheet; `wrong-format` action
  → re-open source sheet; `network` action → retry upload.
- **Uploading / cropping TopBar**: When `viewState === 'uploading'`, the back
  arrow button is disabled. For `cropping`, the back arrow is the AvatarCropScreen's
  own oncancel (resets viewState to 'edit'). For `success` and error states, the
  TopBar uses a custom `left` snippet (not `showBack`) with an onclick that sets
  `viewState = 'edit'`. Do **not** use `showBack` for these states — TopBar's
  `history.back()` would navigate away from `/profile`.
- **Upload request**: `fetch('/avatars', { method: 'POST', body: formData })`.
  Errors: 413 → `too-big`; 415 or 422 → `wrong-format`; network error →
  `network`. Success: read `res.json()` for `{ version }`, update
  `profile.avatarVersion = version`, then set `viewState = 'success'`. (The
  store is updated in the `.then()` handler — not deferred to the Done button
  — so that if the user presses Cancel mid-upload and the fetch still completes,
  the store reflects the new version silently per the non-requirement.)
- **Remove flow** (R10): `let removing = $state(false)`. Clicking Remove sets
  `removing = true`, calls `pgPost('/rpc/clear_avatar', {})`, then `fetch('/avatars/me',
  { method: 'DELETE' })` (best-effort — ignore failure). On RPC success: `profile.avatarVersion = 0`
  (button disappears because `avatar_version === 0`). Bind `disabled={removing}` to the
  Remove button to prevent double-taps. On RPC failure: reset `removing = false` and show
  a `<Snackbar>` with message "Couldn't remove picture — try again." (same Snackbar used by
  the delete-item flow). Import `Snackbar` and manage its trigger state in the page script.
- **Vite `/avatars` proxy**: Added to `vite.config.ts`. Forwards all `/avatars`
  requests to `http://localhost:8080`. For POST/DELETE, injects `Authorization:
  Bearer <jwt>` from the `cairn_session` cookie (same `readBearerFromCookie`
  helper already used by the `/api` proxy). No path rewrite needed.
- **MSW handlers for tests**: Add `http.post('*/avatars', ...)` returning
  `{ version: 1, url: '/avatars/test-uid.webp?v=1' }` and
  `http.delete('*/avatars/me', ...)` returning `{ ok: true }`.
  Add `http.post('*/api/rpc/set_display_name', ...)` returning `{}` (204).
  Add `http.post('*/api/rpc/clear_avatar', ...)` returning `{}` (204).

**Reference:** `design/cairn-avatar-screens.jsx` → `EditProfileScreen`,
`UploadingState`. Also `docs/ui.md` TopBar visual spec, button order.

**Files:**
- `web/src/routes/(app)/profile/+page.svelte` (replace stub with full impl)
- `web/src/routes/(app)/profile/page.test.ts` (create)
- `web/src/lib/test/handlers.ts` (add sidecar + RPC handlers)
- `web/vite.config.ts` (add /avatars proxy)
- `web/src/lib/shared/styles/tokens.css` (add @keyframes cairnBlink)

**Steps:**
1. **RED** — Write `page.test.ts` with these cases (mock AvatarSourceSheet,
   AvatarCropScreen, Avatar, TopBar, profile store):
   - `(a)` shows avatar and display name in edit state.
   - `(b)` Save button calls `set_display_name` RPC.
   - `(c)` Remove button is absent when `profile.avatarVersion === 0`.
   - `(d)` Remove button is present when `profile.avatarVersion === 1`.
   - `(e)` clicking Remove calls `clear_avatar` RPC and DELETE /avatars/me.
   - `(f)` clicking Change picture opens AvatarSourceSheet.
   - `(g)` upload success state renders "Saved".
   - `(h)` upload too-big error renders "That's a big one".
   - `(i)` when `set_display_name` returns a 422 with `[{ code: '23514' }]` and the
     name input is blank, the page shows "Name can't be blank". Use
     `server.use(http.post('*/api/rpc/set_display_name', () => HttpResponse.json([{ code: '23514', message: '...' }], { status: 422 })))` before this test.
   - `(j)` when `set_display_name` returns a 422 with `[{ code: '23514' }]` and the
     name input has content, the page shows "Name must be 100 characters or fewer".
   - `(k)` when `clear_avatar` returns a non-2xx, the Snackbar message "Couldn't remove
     picture — try again." is visible and the Remove button re-enables. Override
     `*/api/rpc/clear_avatar` with a 500 response before this test.
   Run `pnpm test`; tests must fail.
2. Add MSW handlers to `handlers.ts`:
   - `http.post('*/avatars', ...)` → `HttpResponse.json({ version: 1, url: '/avatars/test.webp?v=1' })`.
   - `http.delete('*/avatars/me', ...)` → `HttpResponse.json({ ok: true })`.
   - `http.post('*/api/rpc/set_display_name', ...)` → `new HttpResponse(null, { status: 204 })`.
   - `http.post('*/api/rpc/clear_avatar', ...)` → `new HttpResponse(null, { status: 204 })`.
3. Add `@keyframes cairnBlink { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }`
   to `web/src/lib/shared/styles/tokens.css`. This keyframe is not yet defined
   anywhere in the app; it is needed for the uploading disc animation and can be
   shared by any future blink-style effect.
4. Implement `+page.svelte` (replace stub):
   - Script: import Avatar, AvatarSourceSheet, AvatarCropScreen, TopBar, Icon,
     pgPost, profile, goto, resolve, etc. Define `viewState`, `pendingFile`,
     `showSourceSheet`, `removing`, and `nameError` state.
   - Template structure (top level):
     ```
     {#if viewState === 'edit'}
       <!-- edit view -->
       {#if showSourceSheet}
         <AvatarSourceSheet onfile={...} oncancel={() => (showSourceSheet = false)} />
       {/if}
     {:else if viewState === 'cropping'}
       <!-- AvatarCropScreen -->
     {:else}
       <!-- upload states (uploading / success / too-big / wrong-format / network) -->
     {/if}
     ```
     AvatarSourceSheet **must** be inside `{#if showSourceSheet}` — because it
     passes `open={true}` to Sheet internally (the history guard is always active
     while it is mounted), rendering it unconditionally leaves the guard permanently
     active on the edit screen.
   - The `onsave` callback from AvatarCropScreen receives `blob: Blob | null`. Map
     `null` to `viewState = 'wrong-format'` (crop failure); map a real Blob to
     `viewState = 'uploading'` and start the upload.
   - Implement edit view, crop view (wraps AvatarCropScreen), and all upload
     state variants per PLAN.md decisions.
5. Add the `/avatars` proxy entry to `vite.config.ts` after the `/auth` proxy
   block.
6. **GREEN** — Run `pnpm test`; all profile page tests must pass.

**Verify:** `pnpm lint && pnpm check && pnpm test`

**Notes:** Two deviations from the task spec:

- **`postgrest.ts` updated (side work)**: PostgREST returns `[{code,message,...}]` (array) for constraint-violation errors from RPCs, but `request()` was only handling single-object error bodies. Added normalisation: `Array.isArray(raw) ? raw[0] : raw` so `ApiError.code` is properly populated. Without this, the `23514` error code was unreachable and the page fell back to input-value sniffing. This is a correctness fix for all existing callers too.
- **Name-error handling is code-specific**: The page catches only `ApiError` with `code === '23514'` and shows the validation message; all other errors show "Something went wrong — please try again." rather than a misleading validation string.
- **Apostrophe encoding**: The Write tool auto-upgraded straight apostrophes to curly quotes in `UPLOAD_TITLE` for `'too-big'` and `'wrong-format'`; fixed via `sed` after the fact.

**Bug fixed post-completion:**

- **Sidecar 500 on upload** (`sidecar/src/routes/avatars.ts` + `sidecar/src/index.ts`): `bump_avatar_version()` is declared `RETURNS int`, so PostgREST v12 returns a bare scalar (e.g. `1`), not `[{ avatar_version: 1 }]`. The sidecar was reading it as `Array<{ avatar_version: number }>`, so `data[0]` was `undefined` → TypeError → unhandled → Express default HTML 500. The file write and DB bump both succeeded (avatar appeared after F5), but the sidecar crashed before it could return the new version to the frontend. Fixed by reading `const version = (await pgRes.json()) as number` and correcting the Vitest mock to `Response.json(1, ...)`. Also added a global Express error handler to `index.ts` so future unhandled errors return JSON rather than HTML. Note: the fix only takes effect after `docker compose up --build sidecar -d` — a plain `docker compose restart` runs the old compiled image.

---

## Phase 5 — Orphan sweeper

### [ ] 5.1 Orphan sweeper + `crontab.example`

**Created:** 2026-05-25T00:00:00Z
**Completed:**

**Why:** Closes the file-lifecycle loop: if the sidecar writes a file but the
PostgREST `bump_avatar_version` call fails, the file is orphaned but invisible
(no row points at it). The sweeper is the safety net.

**Prerequisites:** None (ops-only, no frontend dependency).

**Decisions:**
- Pure shell script: `find` + `psql`. No Node runtime needed on the VPS cron host.
- Connects as the `cairn` Postgres role via `DATABASE_URL` env var.
- Query: `SELECT id FROM profiles WHERE avatar_version > 0`. Compares against
  UUID-named files in `/srv/cairn/avatars/`.
- Files whose UUID has no matching live row are unlinked.
- Script is `set -euo pipefail`; passes ShellCheck + shfmt.
- `crontab.example` shows a nightly `0 3 * * *` entry.

**Files:**
- `scripts/sweep-avatars.sh` (create)
- `crontab.example` (create)

**Steps:**
1. Write `scripts/sweep-avatars.sh`:
   - `#!/usr/bin/env bash` + `set -euo pipefail`.
   - `AVATARS_DIR="${AVATARS_DIR:-/srv/cairn/avatars}"`.
   - Fetch live UIDs from Postgres into a temp file via `psql "$DATABASE_URL" -t
     -A -c "SELECT id FROM public.profiles WHERE avatar_version > 0"`.
   - `find "$AVATARS_DIR" -maxdepth 1 -name "*.webp" -type f` to list files.
   - For each file, extract UUID (filename without `.webp`), check against live
     UIDs, unlink if absent.
   - Print a one-line summary: `Swept N file(s) — K orphan(s) removed.`
   - `chmod +x scripts/sweep-avatars.sh`.
2. Write `crontab.example` with: `0 3 * * * DATABASE_URL=... AVATARS_DIR=...
   /home/cairn/scripts/sweep-avatars.sh >> /var/log/cairn-sweep.log 2>&1`
   and a comment explaining the two env vars.

**Verify:** `shellcheck scripts/sweep-avatars.sh && shfmt -d scripts/sweep-avatars.sh`

---

## Phase 6 — End-to-end tests

### [ ] 6.1 Playwright e2e for avatar flows (R7–R10)

**Created:** 2026-05-25T00:00:00Z
**Completed:**

**Why:** Confirms the upload, replace, and remove flows work end-to-end against
the real backend (GoTrue + PostgREST + sidecar + Caddy). Playwright exercises
the full stack including the Vite proxy and the sidecar's JWT verification.

**Prerequisites:** All previous tasks done. Dev stack running (`docker compose up`).

**Decisions:**
- New file `web/e2e/avatar.spec.ts`. Modelled after `auth.spec.ts` (magic-link
  sign-in using `waitForMagicLink` helper, then exercise the avatar flows).
- Upload test: sign in, navigate to Settings → profile chip → Edit Profile,
  tap Change picture, pick a test image (`web/e2e/fixtures/test-avatar.jpg`),
  skip crop step (programmatic or by setting the file on the input directly),
  assert the "Saved" state appears and the Avatar img src contains `?v=1`.
- Remove test: after upload, tap Remove, assert avatar reverts to initials.
- The test fixture image must be a small valid JPEG (`web/e2e/fixtures/`).
- If the e2e stack is not available (CI env flag `SKIP_E2E`), the test is
  skipped with `test.skip`.

**Files:**
- `web/e2e/avatar.spec.ts` (create)
- `web/e2e/fixtures/test-avatar.jpg` (create — tiny valid JPEG)

**Steps:**
1. Create `web/e2e/fixtures/` and add a small (1×1 or 10×10) valid JPEG as
   `test-avatar.jpg`.
2. Write `web/e2e/avatar.spec.ts`:
   - Sign in via magic link (re-use `waitForMagicLink` helper).
   - Navigate to Settings (`/settings`), click the profile chip
     (`[data-test="profile-chip"]`), confirm URL is `/profile`.
   - Tap Change picture button. Assert AvatarSourceSheet appears
     (`[data-test="avatar-source-sheet"]` or the actual library input).
   - Use `page.setInputFiles` on the file input to inject `test-avatar.jpg`
     (bypasses the OS file picker).
   - On the Crop screen, click the Save button (`[data-test="crop-save"]`).
   - Assert the Uploading state is shown, then the Saved state.
   - Click Done. Confirm the Avatar on Edit Profile is now an `<img>`.
   - Click Remove. Confirm avatar reverts to initials disc (no `<img>` tag).
   - **Display name (R12):** in the same session, navigate back to Edit Profile,
     clear the display-name input (`[data-test="display-name-input"]`), type a
     new name (e.g. "Alice Updated"), click Save (`[data-test="save-profile"]`),
     confirm navigation returns to Settings, and confirm the profile chip shows
     "Alice Updated".

**Verify:** `cd web && pnpm test:e2e` (requires dev stack).
