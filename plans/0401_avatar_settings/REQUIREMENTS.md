# Requirements: Avatar component + Settings screen

Sub-step 0401 of the step-4 MVP surface. Avatar and Settings are the two
foundational pieces that land before the list and item screens: Avatar is
used in the Settings profile chip and later in item attribution; Settings
gives the existing `preferences.svelte.ts` store a real UI and moves Sign Out
out of the temporary placeholder home page.

## R1. `Avatar` component — initials disc

`Avatar.svelte` in `lib/shared/components/` renders a filled circle with the
user's initials. Props: `displayName: string`, `size?: number` (default 40).
Initials are derived as the first character of the first word and (if more
than one word) the first character of the last word, uppercased. The
background colour is deterministic from `displayName` — the same name always
produces the same hue — using `oklch(70% 0.10 <hue>deg)` with the hue
computed via a simple hash of the name characters. Text colour is white.
The component renders a `data-test` prop for testability.

The photo branch (`avatar_version` column, step 5) is not present. The
component receives only `displayName`; no profile data is fetched from
inside the component.

## R2. Profile reactive store

`shared/state/profile.svelte.ts` holds the current user's `display_name` as
a reactive value. It fetches `GET /profiles?id=eq.<uid>&select=display_name`
(via `pgGet`) when the session becomes `signed-in`, deriving the uid from
`session.current.user.id`. While the fetch is in-flight or the session is not
yet signed in, `profile.displayName` is `null`. It does not expose the user's
email address.

A `__mocks__/profile.svelte.ts` ships alongside so component tests can
control `profile.displayName` without a real fetch.

## R3. Settings screen component

`settings/components/SettingsScreen.svelte` renders:

1. **Profile chip** — `Avatar` (size 44) next to `profile.displayName`. While
   `profile.displayName` is `null` (initial load), the chip shows a skeleton
   shimmer: a circle placeholder (44 × 44 px, `border-radius: 50%`) and a
   short rectangle placeholder for the name, both rendered with a CSS shimmer
   animation (`data-test="profile-chip-skeleton"`). No Avatar is rendered in
   the skeleton state. No tap-through — profile editing is a later step.
2. **Appearance section** — wired to the existing `preferences` store:
   - Theme row: three inline buttons — Light, Dark, System. The active choice
     is highlighted. Changing a button updates `preferences.theme` immediately
     and the change persists via `localStorage` (the existing store already
     handles this). Buttons carry `data-test="theme-light"`, `"theme-dark"`,
     `"theme-system"`.
   - Font size row: five inline buttons — XS, S, M, L, XL. Same active-
     highlight + immediate-persist pattern. Buttons carry
     `data-test="fontsize-xs"`, `"fontsize-s"`, `"fontsize-m"`,
     `"fontsize-l"`, `"fontsize-xl"`.
3. **Sign Out** — a ghost `Button` at the bottom with `data-test="signout"`,
   calling the existing `signOut()` from `session.svelte.ts`. This attribute
   and variant must match the temporary button in the placeholder `+page.svelte`
   so the Playwright auth spec selector survives the move.

Other settings rows (Invites, Privacy, Deleted lists, Download my data, About,
Delete account) are explicitly deferred to their respective steps and are
absent here — not rendered as disabled stubs.

## R4. Settings route and layout group

`src/routes/(app)/settings/+page.svelte` renders `SettingsScreen`. It sits
under a `src/routes/(app)/+layout.svelte` that for now simply renders
`{@render children()}` — the route group is created here as an organisational
anchor for all product screens; 0402 will add a real guard if needed.

## R5. Placeholder home page updated

`src/routes/+page.svelte` loses the temporary Sign Out button and its comment
block. The page is updated to note that Sign Out now lives in Settings and
that Lists land in 0402.

## R6. Playwright auth spec updated

The existing auth Playwright spec (`web/e2e/auth.spec.ts`) has a step that
clicks `[data-test=signout]`. After this sub-step that button is at
`/settings`, so the spec navigates to `/settings` before clicking it.

## Non-requirements (explicitly excluded)

- **Photo avatar branch** — `profiles.avatar_version` column does not exist yet; step 5 adds it. The `Avatar` component is initials-only here.
- **Settings nav rows** (Invites, Privacy, Download, Deleted lists, About, Delete account) — each belongs to its own step.
- **Display-name editing** — the profile chip has no tap-through; editing `display_name` is a later step.
- **`user_settings` DB writes** — theme and font size are device-local (`localStorage`); no DB column is read or written.
- **Profile picture upload sidecar** — that is step 5; the `avatar/` domain folder is not created here.
