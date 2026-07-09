# UI conventions

This document captures user-interface decisions that affect more than one screen, or that have implications for the data model. The web app's full design isn't here — only the conventions that needed to be settled deliberately and recorded so we don't drift away from them.

Cairn is a Progressive Web App built with SvelteKit. "The app" in this document means the running web app — installed to the home screen on phones, or running in a browser tab on desktop. The conventions below apply identically across both presentations except where called out.

## First launch — choose your name

Brand-new accounts land on a single-field screen (_"What should we call you?"_) before anything else loads. The on-signup trigger seeds `profiles.display_name` with the fixed placeholder `'New user'` (see `data-model.md` → `tg_profile_on_signup` for why the placeholder isn't derived from the email's local part), and the app forces this screen whenever it reads that placeholder back. A short input, a single **Continue** button, no skip — the user can rename later from Settings → Edit profile, but they can't reach the Lists screen carrying the placeholder. The avatar is also `avatar_version = 0` at this point, so the user is rendered as the initials disc of whatever name they pick from here on (see "Avatars" below).

## Lists screen

The first screen the user sees after logging in: their lists, in order of most recently modified. Each row shows the list name and a one-line preview of its description.

```
Movies for Alice
A short description that fits on one line and trun…

Movies for Bob
Another list with a longer description that also g…

Things to do in Amsterdam
(no description)
```

Two distinct interactions on a list row:

- **Tap the name** → navigate into the list (the items screen).
- **Tap the description** → expand it inline to show the full text. Tap again to collapse.

The split is deliberate. The name is the primary action — that's how you get to the contents — and the description tap is secondary, for when the one-line preview isn't enough. A list with no description renders as `(no description)` in muted text and isn't tappable for expansion.

The expanded description pushes the rows below it down (accordion style, same as items — see below). Multiple list descriptions can be expanded simultaneously on this screen; the constraint of "only one open at a time" applies to items, not list descriptions, because list descriptions are short and the cost of having several open is small.

Each row also shows a metadata line: item count, time since last modification, and avatar initials of current members.

A floating button creates a new list. Editing a list's name or description and deleting a list are done via a `⋮` overflow button on each list row, which opens a bottom sheet — see "Bin & undo" below.

## Items screen

Inside a list. Each collapsed row shows the item name and, when the score is non-zero, a score badge at its right edge. The vote control itself lives in the extra panel (see below), not on the row.

```
Item name here, possibly long…                       +4
Another item
The one everyone loves                               +9
```

**Item name on the left, score badge on the right.** The item is the content; the badge is its standing at a glance, on the trailing edge where the eye expects a summary value. Voting is a deliberate act, so it lives one tap away in the unfolded extra panel rather than on every row — this keeps the collapsed list a clean scanning surface.

Long names truncate with an ellipsis before they would push the score badge off-screen. The badge's slot is fixed-width, so the row's right edge never shifts as the badge appears or disappears.

### The accordion unfold

**Tap an item row** to unfold its full extra panel inline. Tap again on the same item to close. **Only one item is unfolded at a time per list** — opening one closes any other that was open. The unfold pushes the items below it down; it doesn't overlay or popover.

What's inside the extra panel:

- **Notes** — the full text of the item's notes, if any. Plain text, soft-wrapped. When the item has no notes, a muted italic _"(no notes)"_ placeholder stands in, matching the Lists screen's _"(no description)"_ treatment.
- **Per-member votes, and the vote control** — share one row: the breakdown `Alice +3 · Bob +1 · Carol −2` reads at a glance (same red/muted/green colouring as the score badge), with the vote control right-aligned at the row's end. When no one has voted yet, a muted italic _"(no votes)"_ placeholder takes the breakdown's place (the vote control stays right-aligned). Voting updates the per-member breakdown live, which is part of the satisfaction.
- **Attribution** — `Added by Alice on 1 May 2026.` If the item has been edited since, also: `Last edited by Bob on 3 May 2026.` Dates are formatted in the user's locale.
- **A `⋮` (More) button** — pinned to the top-right corner of the extra panel. Tapping it opens an item overflow sheet (a bottom sheet) with **Edit** and **Delete** rows (and, in future, **Copy/Move between lists**); non-destructive Edit first, destructive Delete last, per the button-order rule. Edit opens a small form for name and notes; Delete soft-deletes after a confirmation. Both are available to any list member.

The collapsed row itself stays minimal — just the item name and, when the score is non-zero, a score badge at its right edge. The vote control moved into the extra panel, so a member opens the item to vote.

### Why one at a time

A list of recommendations is a scanning experience. With two or three items unfolded, the rest of the list scrolls off-screen and you lose the comparative view that's the whole point. Forcing one-at-a-time keeps the list legible and matches how users actually want to interact: open one, read it, close it (or open the next one, which closes this one).

## The vote control

Three elements, always in the same order: thumb-down button, vote indicator, thumb-up button.

The **vote indicator** shows the current user's vote on this item, as one of seven values:

| Vote | Display | Color           |
| ---- | ------- | --------------- |
| −3   | `---`   | red             |
| −2   | `--`    | red             |
| −1   | `-`     | red             |
| 0    | `0`     | muted (default) |
| +1   | `+`     | green           |
| +2   | `++`    | green           |
| +3   | `+++`   | green           |

The indicator's slot is **fixed-width** — wide enough to hold `+++` without truncation. `0` and the single `+`/`-` characters are centered within that slot. This means rows do not reflow, shimmer, or shift as votes change. Color is applied to the characters, not the slot background, so the layout reads as stable even when many items are visible at once.

The `0` state doubles as "I haven't voted." Conceptually, "neutral" and "haven't considered yet" are similar enough that splitting them into separate UI states is more cognitive load than it's worth, and the database stays simple — neutral is row absence, not a stored zero. (See `data-model.md` on the `votes` table.)

## Vote interaction

Tapping a thumb **nudges the vote by one** in that direction.

- Tap thumb-up at `0` → `+`
- Tap thumb-up at `+` → `++`
- Tap thumb-up at `++` → `+++`
- Tap thumb-up at `+++` → stays at `+++` (clamped; no wrap)
- Tap thumb-down at `+++` → `++`
- ...and so on, symmetrically, down to `---`

Reasons:

- **Relative nudging matches the +/- mental model.** People expect that pressing "up" makes things go up by one.
- **Clamping at the ends is safer than wrapping.** Wrapping `+++ → ---` on an extra tap is a footgun that's hard to recover from. If a user wants to flip sides, the opposite thumb is right there and the path through `0` is short.
- **One tap = one vote unit.** This keeps the speed of binary voting for the common case (one tap to express interest), while leaving room for stronger feelings when they exist.

At the extremes (±3), the button in the clamped direction renders at 35% opacity with `cursor: default` and emits no event when tapped. The opposite button remains fully active. This matches the design spec in `design/cairn-ui.jsx` `VoteControl`.

## Color

Three semantic colors used by the vote indicator and the per-member vote breakdown:

- **Red** for negative values. Should be a calm, readable red — not the alarming kind. Same red is reused elsewhere only for actually destructive actions (delete confirmations).
- **Green** for positive values. Same caveat — readable, not aggressive.
- **Muted** (the default text color, but slightly softened) for `0` and for the "haven't voted" state.

The thumb buttons themselves are not colored; they're rendered in the platform's standard icon-button style. Coloring the buttons too would compete visually with the indicator and add no information.

The colors must remain readable in both light and dark themes. Concrete values are defined as CSS custom properties in the app's theme; this document only fixes the semantics.

## Viewport, safe areas, and browser chrome

Cairn is a web app, but on a phone it lives inside a viewport surrounded by system UI: a status bar at the top, a gesture pill or three-button nav at the bottom on Android, a home indicator on iOS, a virtual keyboard whenever a text field has focus. On desktop it lives inside a browser tab or a standalone window. The layout has to behave correctly on all of these without us drawing any of it ourselves.

The app uses three CSS techniques together:

- **`viewport-fit=cover`** in the meta tag, so the page extends edge-to-edge on devices with safe-area insets (notches, rounded corners, the home indicator).
- **`env(safe-area-inset-*)`** for the actual insets. Every screen's outer container reserves `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` of padding so content doesn't sit underneath the notch or the home pill. Bottom sheets do the same on the bottom edge — the delete-item confirmation and the list overflow sheet both need it, so destructive buttons aren't ever overlapped by system gestures.
- **`100dvh` (dynamic viewport height)** instead of `100vh` for full-height layouts. `dvh` shrinks when iOS Safari's address bar expands, which keeps the FAB visible instead of clipped behind chrome.

The floating action button is positioned with `position: fixed; bottom: calc(env(safe-area-inset-bottom) + 16px); right: 16px;`. Never a bare `16px` on `bottom`. The snackbar uses a slightly larger offset: `bottom: calc(env(safe-area-inset-bottom) + 18px)` — matching the design spec (`ItemsScreenWithUndo`, `design/cairn-screens.jsx`).

The virtual keyboard is the trickiest piece. The web platform's [VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) is the source of truth: when the keyboard opens, the visual viewport shrinks. The app listens for `visualViewport.resize` and adjusts the layout so the focused text field stays visible above the keyboard. CSS-only approaches (e.g. `100dvh`) handle most cases on Android Chrome but fail on iOS Safari, where the keyboard can sit _over_ the page without resizing the layout viewport — the JS path is required.

When the app is running as an installed PWA (`display: standalone` in the manifest, see `architecture.md`), there's no browser address bar and no tab strip — the page is the whole window. When it's running in a browser tab, the address bar is part of the user's chrome, and we don't try to hide or compete with it. Either way, our work begins inside the viewport the browser hands us; we don't draw OS chrome and we don't pretend it isn't there.

This is invisible work — done right, the user never notices. Done wrong, the FAB is half-eaten on some devices, the keyboard hides the input on iOS, and the home indicator overlaps a bottom sheet's destructive button.

## Navigation and back

Every back affordance — the in-app **←** in the top bar, the Android hardware/gesture back, the iOS Safari swipe-back, and the desktop browser back button — must do the same thing. To the user these are one action; the moment they diverge ("the back button broke") is the moment trust in the app drops.

The principle: **the back stack is the source of truth, and every visible thing the user can dismiss puts an entry on it.**

Concretely:

- **Route changes push history.** SvelteKit's router does this by default for `goto()` and `<a href>` — every screen transition (Lists → Items → Item details → Edit, etc.) adds an entry. Browser back and Android system back call `history.back()`, which SvelteKit handles as a route change in reverse. The in-app top-bar **←** also calls `history.back()` (never a hard-coded previous route), so it cannot disagree with system back.
- **Dismissible overlays push history too.** Bottom sheets (delete-item confirmation, list overflow menu, item overflow menu, invite picker, avatar source sheet), modal dialogs, the profile sheet, and the unfolded item extra panel all push a state on open and listen for `popstate` to close. The user expects back to close what they just opened; system back, the sheet's own Cancel, a tap on the backdrop, and pressing `Escape` on a hardware keyboard are then equivalent. Without this, back skips past the overlay and pops the user out of the screen entirely — the bug usually reported as _"the back button is broken."_
  - **Implementation: a guard `$effect` must `untrack` the push.** Overlays install their entry with `pushHistoryGuard` (`$lib/shared/state/back-stack.svelte`) inside an `$effect`, and that call **must** be wrapped: `return untrack(() => pushHistoryGuard(() => close()))`. `pushHistoryGuard` calls SvelteKit's `pushState`, which _reads_ SvelteKit's internal **reactive** history state; an un-`untrack`ed effect tracks that read, re-runs on the next history change, and re-pushes a fresh guard — stacking entries until no back affordance can escape (again _"the back button is broken,"_ this time stuck rather than skipping). `Sheet.svelte`, `Accordion.svelte`, and `ItemsScreen.svelte` follow the pattern; the `*.history-guard.test.ts` regressions lock it in (a mocked `pushState` reads a reactive flag and asserts a later history change does not re-push). Plain mocked-`pushState` tests can't catch this — the mock must read a reactive source.
- **The Lists screen is the back-stack root.** Pressing back from there does nothing inside the running app. On Android-installed-PWA the OS handles it (typically closes the app), which is fine — we don't fight the platform. On iOS-installed-PWA (`display: standalone`) there is no system back gesture at all, so the in-app **←** is the only path; the design's top-bar arrow must always be reachable.
- **The auth callback URL replaces history rather than pushing.** Hitting back from the first post-login screen must not return the user to `cairn.<domain>/auth/callback?token=…`, which is single-use. Use SvelteKit's `goto(target, { replaceState: true })` from the callback handler.
- **Transient surfaces don't push history.** The 6-second undo snackbar dismisses on its own timer; it doesn't consume a back press. Pressing back during the snackbar does whatever back means at that point in the route — it doesn't dismiss the snackbar in lieu of navigating.
- **Accept invite navigation pushes**, so back from the freshly-joined list returns to the inbox / lists screen the user came from, not out of the app.
- **Back never makes a destructive choice on the user's behalf.** Back from a delete-confirmation sheet dismisses the sheet (same as Cancel, never Delete). Back from Edit item with unsaved changes opens a "Discard changes?" sheet, which is itself a dismissible overlay — completing the recursion. Back from the Delete-account screen leaves the typed-confirmation state intact but does not submit.

Playwright should exercise this. Each user-journey spec (`testing.md`) should include a system-back press at every transition that proves back goes where the user expects — both for full-route transitions and for at least one dismissible overlay (the delete-item sheet is a good canary).

## Settings

A Settings screen, reachable from the **gear icon** in the top-right of the Lists screen. Each list row also has a ⋮ button that opens a per-list overflow sheet (see "Bin & undo" below). The screen is the canonical hub: every other Settings-shaped surface ladders back to it.

A profile chip sits at the top: current avatar (initials disc or photo), display name, chevron. Tapping it opens **Edit profile** — see "Avatars" below. Below the chip, the screen is grouped into named sections.

Two adjacent sections hold the device-local preferences:

- **Colour theme.** Light / dark / system. Default: system. The app re-themes immediately on change; no restart.
- **Text size.** Five steps: XS, S, M, L, XL. Default: M. Implemented as a single scale factor applied to the root `font-size` (with all type sizes in `rem`) so every text style scales together and the layout stays balanced.

Larger sizes are not just an accessibility nicety — Cairn is read in cafés, on a couch, with a glass of wine. The defaults should look good at M; L should feel like a proper "large text" mode without breaking any layout.

Both preferences are **device-local** — stored in `localStorage`, not in the database. Theme and font size are properties of the screen you're reading on (a phone in bright sun versus a laptop indoors at night), not properties of the user, so they shouldn't follow you across devices. Anything that genuinely _should_ follow the user — invite policy, future notification preferences — lives on `user_settings` (see `data-model.md`).

The other sections are navigation rows that open dedicated screens:

- **People → Invites** — pending invitations to lists, with Accept / Decline. See "Invites & circles" below.
- **People → Privacy** — who can invite you, who's in your circle, who you've blocked. See below.
- **Privacy & data → Download my data** — produce a per-user export archive. See `data-export.md` and `design/cairn-export-screens.jsx`.
- **Recovery → Deleted lists** — restore lists you've soft-deleted.
- **About → About Cairn** — version, privacy policy, terms, open-source attributions, contact, license. See `design/cairn-legal-screens.jsx`.
- **Account → Sign out**, **Account → Delete account**.

The **Sign out** action is the first row of the Account section. **Delete account** is in red, below Sign out, and opens a dedicated screen, not a confirmation dialog — see "Account deletion" below and `account-deletion.md` for the full model.

### Avatars

Cairn renders the same `<Avatar>` everywhere a user appears (item attribution, members list, profile sheets, the Settings profile chip). The component branches on `profiles.avatar_version`: `0` (the default) renders the existing colored initials disc; any positive integer renders an `<img>` with `src="/avatars/{uid}.webp?v={avatar_version}"`. See `avatars.md` for the storage decision, the cache-busting URL pattern, and the upload sidecar.

The user-facing flow lives in `design/cairn-avatar-screens.jsx`:

- **Settings profile chip** (the top row of Settings) opens the **Edit profile** screen (A1).
- **Edit profile** shows the avatar at hero size with a small **Change** affordance overlaid; below, an editable display name; below that, a muted **Remove picture** row only visible when `avatar_version > 0`.
- Tapping **Change** opens the **source sheet** (A2): **Take photo**, **Choose from library**, **Cancel**. Uses the platform's native `<input type="file">` with `accept="image/*"` (and `capture="user"` for camera) — no custom permission handling.
- The **crop step** (A3) shows a square viewport with a circular crop overlay, so the user previews exactly what the final disc will look like. Pinch / zoom / drag. Client-side crop is preview only — the sidecar re-validates and re-resizes server-side.
- Five **upload states** (A4–A8): uploading (spinner + Cancel), saved (brief check-mark), no-connection error, too-big error, wrong-format error. The crop step preserves the picked image on retry so the user doesn't re-pick.

The "Deleted user" tombstone keeps `avatar_version = 0` forever — the same initials-disc-fallback branch renders the gray-disc-no-initials treatment described under "Account deletion screen" below, exactly as today. Adding the column doesn't change the tombstone path.

### Account deletion screen

Tapping **Delete account** in Settings opens a full-screen page. It is not a sheet and not a confirmation dialog — this isn't a quick action. The page is divided into three plain-language blocks, each with its own small heading:

1. **What's permanently removed.** Your email, your profile, every vote you've cast on any list. None of this can be recovered.
2. **What stays.** Items you've added on lists you share with other people, including their names and notes. Bob and Carol need that material to keep using their lists. Your name on those items changes to "Deleted user" with a gray avatar; the items themselves are unchanged.
3. **What's deleted with you.** Lists where you were the only remaining member, along with everything on them. Nothing of yours is left behind in someone else's space.

Below those blocks: a single text field labeled _"Type **delete** to confirm"_ and a destructive **Delete my account** button in ember, disabled until the user types the magic word. Above the button, in muted text: _"This can't be undone."_ No countdown timer, no checkboxes — the typed confirmation is the friction.

A small non-blocking panel sits _above_ the destructive button: _"Want a copy of your data first? A few seconds. Yours to keep, even after deletion."_ with a **Download** button that opens the Data export hub. Tapping it navigates to the export hub; the Delete account screen's state (typed-confirmation, etc.) is preserved when the user returns. Export and delete are independent — neither blocks the other. See `data-export.md` and screen E5 in `design/cairn-export-screens.jsx`.

After tapping the destructive button: a brief loading state, then a confirmation screen ("Your account has been deleted") with a single button back to the sign-in screen. The session cookie is cleared (the server's `DELETE /auth/session` endpoint sets `Max-Age=0` on the `cairn_session` cookie); the app is fully logged out.

The "Deleted user" tombstone gets a specific visual treatment wherever an avatar would normally render: a flat gray disc, no initials. The muted-italic display-name treatment is scoped to the **Items accordion** in v1 — it appears on item attribution lines there, and a future revisit may extend it to the members list (rare — the tombstone is never an active member) and to bin-screen "deleted by …" attribution. The bin screens currently render the literal display name "Deleted user" in the standard `var(--stone-lt)` color, same as any other deleted-by attribution.

For the data model behind all of this, see `account-deletion.md`.

## Invites & circles

The full feature is documented in `invites.md`; this section covers the UI surfaces it affects. Three new screens, plus changes to the lists screen and the long-press menu on members.

### Inbox row on the Lists screen

When the user has at least one pending invite, a single row appears at the top of the Lists screen, above the list of lists:

- One pending invite: _"Alice invited you to **Stuff to read**"_ with two inline affordances — **Accept** (filled sage) and **Decline** (outlined).
- More than one: _"3 pending invites"_ with a chevron; tapping opens the full inbox screen.

The row uses a slightly tinted background (warm cream in light mode, slate-700 in dark) to distinguish it from list rows without competing for attention. It disappears entirely when the inbox is empty — invites are not a permanent UI element.

### Invites inbox screen

Reachable from Settings → Invites or by tapping the multi-invite row on the Lists screen. Plain list of pending invitations, sorted newest first. Each row:

- Inviter's display name and avatar.
- _"invited you to"_ in muted text.
- The list name, in the same weight as a list-row title.
- An **Accept** button (filled sage) and a **Decline** button (outlined), side by side.

Accept navigates immediately into the list (the user is now a full member). Decline removes the row with no animation drama and no "Are you sure?" — the row is replaced by the next pending invite, or by an empty-state message if it was the last (_"No pending invites"_, gentle, friendly).

There is no "report as spam" affordance and no "Bob invited you again" coalescing in v1 — the dedup is done server-side at insert time (one pending invite per list per recipient).

### Privacy screen

Reachable from Settings → Privacy. Three sections, top to bottom:

**1. Who can invite you to lists.** Three-way segmented control:

- **Everybody** (default — _"Anyone with a Cairn account"_)
- **Your circle** (_"Only people in your circle"_)
- **Nobody** (_"You can still create lists and invite others"_)

The subtitle below the segmented control changes based on the selected value, explaining the concrete consequence in plain language. Changing this setting auto-declines any pending invites that would now be blocked — a one-line note explains this when the value changes (_"3 pending invites have been declined to match your new setting"_).

**2. Your circle.** A row showing the count (_"7 people"_) with a chevron; tapping opens the **Circle** screen. The circle is the per-user allowlist that powers the _"Your circle"_ invite policy. See below.

**3. Blocked.** A row showing the count (_"0 people"_ if empty) with a chevron; tapping opens the **Blocked** screen. People here can never invite you, regardless of any other setting.

### Circle screen

Reachable from Settings → Privacy → Your circle. A single list of **People in your circle** — those you've added. Each row: avatar, display name, a small action affordance to remove.

The screen does _not_ show "people who have you in their circle." Each user's circle is their own private permission setting on themselves — surfacing it to the people listed in it would turn a private setting into a quasi-social signal, which is the opposite of the intent. See `circles.md`.

At the top of the list, a small _"What's this?"_ link opens a brief explainer sheet (one paragraph; same content as the top of `circles.md`). The link is always present — a circle is subtle enough that even returning users may want to re-check.

At the bottom, an **Add by username** field. Typing a `@username` and confirming triggers the mutual username-add path (see `invites.md`). An unknown handle surfaces the distinct _"No one on Cairn has that username"_ error (usernames are public), while success and "they've blocked you" show the same generic toast — the private outcomes stay indistinguishable to preserve their privacy.

The screen is empty-state-friendly: a new user sees the brief explainer above the empty add-by-username field. No graphical empty state.

### Blocked screen

Reachable from Settings → Privacy → Blocked. A plain list of blocked users (avatar + display name) with an **Unblock** action on each row. Empty state: _"You haven't blocked anyone."_ No add-by-username field here — blocking happens from a profile screen, not by typing a handle.

### Profile screen (sheet)

Tapping any user's avatar or name (in a list members screen, the inbox, or anywhere else a user appears) opens a profile sheet. The sheet is modal, dismissed by tap-outside or a chevron-down handle.

Contents:

- Large avatar at top.
- Display name in the same weight as a screen title.
- The person's `@username` directly beneath the display name (the `.identity-handle` role — see the typography roles below). This is the one screen where the handle is prominent rather than a supporting caption, because the profile sheet is where you confirm _who_ a person is.
- (No email, no bio, no member-since, no list of shared lists. Privacy by minimalism — see `invites.md`.)
- A vertical stack of action rows, each tappable, showing only the actions valid given current state:

| Action                    | Shown when                                   |
| ------------------------- | -------------------------------------------- |
| **Add to circle**         | Other user not in viewer's circle            |
| **Remove from circle**    | Other user is in viewer's circle             |
| **Block**                 | Other user not blocked by viewer             |
| **Unblock**               | Other user is blocked by viewer              |
| **Cancel pending invite** | Viewer has a pending invite to a shared list |

The profile screen never shows whether _the other person_ has the viewer in their circle. That's their private setting on themselves; not the viewer's business. (See `circles.md`.)

Add to circle, Remove from circle, and Unblock are quiet — no confirmation, no animation drama. Block prompts for confirmation (_"Block {Name}? They won't be able to invite you to any list."_). Cancel pending invite is also quiet.

Tapping your **own** avatar bounces to Settings rather than opening a profile sheet. There is no "my profile" screen in v1.

### Invite picker (bottom sheet)

Opened from the **Members** screen of a list, by tapping the **Add member** affordance. A bottom sheet sliding up to roughly 75% of the screen height, with three sections, top to bottom:

1. **Your circle** — people in the viewer's circle, excluding existing members of the current list. Each row: avatar, display name, `@username`, a tap-to-invite affordance. A single tap sends the invite; the row briefly shows a check or the generic _"Couldn't send"_ error toast.
2. **People you share other lists with** — live co-members on the viewer's other lists, deduplicated, excluding circle members already in section 1 and existing members of the current list. Same row shape as above.
3. **By username** — a text field at the bottom of the sheet. Submit resolves the typed `@username` and triggers the invite path. An unknown handle shows the distinct _"No one on Cairn has that username"_ error; the private outcomes (blocked, policy) show the same generic toast as the tap-to-invite rows.

Display names, avatars, and `@username` handles only — **no emails are shown** anywhere in the picker, on any row, ever. The manual text field at the bottom takes a `@username`, which the user types themselves.

If a section is empty (e.g. the viewer has no one in their circle yet), the section header and rows simply don't render — the next section takes their place. We don't show empty-state stubs in the picker; the by-username field is always available as a fallback.

For the data model and the policy/block check sequence behind all of this, see `invites.md`.

## Dates

Relative timestamps are shown wherever an age is more meaningful than a calendar date: "just now", "15 minutes ago", "3 days ago". Use the `timeAgo` utility at `$lib/shared/model/time-ago`. It automatically falls back to an absolute date (`1 May 2026`) once the timestamp is more than 30 days old, so old items still show a legible date rather than "400 days ago".

The accordion attribution line reads **"Added by Alice 3 days ago."** — no "on", no preposition before the relative string.

When an absolute date is needed (e.g. the `timeAgo` fallback itself), format it **day-month-year with the month written out**: `1 May 2026`, `14 Apr 2026`. No US `5/1/2026`, no ISO `2026-05-01`. The format is fixed — it does not follow the device locale.

Times of day are not shown anywhere in v1.

## Vote indicator typography

The seven-step indicator is rendered with **plain ASCII characters** (`---` `--` `-` `0` `+` `++` `+++`) in a fixed-width monospace font. We considered weight-scaled variants and dot-bar visualizations during design and rejected both: the ASCII version is the visual signature of the app, instantly readable, and survives in every font fallback chain. The font weight is constant (600); only the color and the character count change between steps.

## Aggregate score on the row

Each item row shows an aggregate-score badge next to the name when the score is non-zero — small, monospace, sage for positive and ember for negative. This is a v1 decision, reversing the earlier "not shown until v2" plan: the badge is small enough not to compete with the per-user vote control, and it gives a quick at-a-glance read of group sentiment that makes the list materially more useful. A score of exactly zero renders no badge (clean, no clutter for items everyone is neutral on).

The user's _own_ vote remains the primary signal on the row (the indicator on the trailing edge); the aggregate is a secondary read on the leading edge. The two never compete because they use different weights and different positions.

## Bin & undo

Soft delete is universal in Cairn (see `data-model.md`): items, lists, and list memberships are marked with `deleted_at`, never removed. The UI surfaces this in two places — a transient undo, and a per-list bin.

### Undo snackbar

Whenever a user soft-deletes an item, a snackbar appears at the bottom of the items screen for **6 seconds**: _"Deleted 'Bringing Up Baby' · Undo"_. Tapping Undo clears the `deleted_at` and the row pops back into place. After the snackbar dismisses, the item is in the bin, recoverable from there. The snackbar replaces — not stacks with — any previous one; the most recent delete wins.

While the snackbar is up, the FAB is hidden. The two share the bottom-right corner, and the Undo affordance must not be covered by the "add" button — undo _is_ the action we want the user to take in those six seconds. The FAB returns when the snackbar dismisses.

The same pattern applies to deleting a list (snackbar on the lists screen) and to removing a member (snackbar on the members screen).

### Bin screen

Each list has a **Bin** entry in its overflow menu (the `⋮` sheet reachable from each list row on the Lists screen and from the `⋮` button in the Items screen TopBar). Opening it shows the list's soft-deleted items, ordered most-recently-deleted first. Each row shows the item name, a faint _"deleted by Bob · 3 May 2026"_ attribution, and a single **Restore** button. Tapping Restore clears `deleted_at` and returns the item to the live list at its original position in the sort.

There is no "empty bin" action. Hard deletion is not exposed in the UI; nothing in v1 ever calls `DELETE` on items. If we ever add a server-side garbage collection for very old deletions, that's a backend decision (see the open question in `architecture.md`), not a user-facing one.

A deleted list is reachable from a separate **Bin** entry in Settings (one bin per user, listing all deleted lists they were a member of). Restoring a list returns it to the lists screen with all its members and its bin intact.

The bin is not a feature we promise users — it's a safety net. The copy in delete confirmations should reflect that without making promises about retention windows: _"Bob and Carol will no longer see this item. You can restore it from this list's bin."_ No "for 30 days," no countdown — just the affordance.

## Public lists

A list can be made **public** — readable by anyone holding its link, while signed out. Public here means _unlisted_: the list id is the capability, there is no directory or browse surface, and the link reveals only a curated read-only snapshot (name, description, ranked items with scores — no members, no votes, no attribution; see `data-model.md` → "Public read access"). Any member may publish or unpublish.

### Public marker (members only)

In **member** views, a public list is marked with a small **globe** icon, muted (`var(--stone)` — there is no `--muted` token; `--stone` is the muted-grey used by the row overflow button and meta text). The placement differs by screen:

- **Lists-screen row:** the globe renders in the nav-row's trailing slot, so it sits at the row's right edge just before the trailing chevron, purely indicative, with a visually-hidden accessible label _"Public list"_ (per the existing icon-labelling pattern). It sits there rather than hugging the name because `NavRow.title` is a plain string — the globe can't be placed mid-title — so the trailing slot is where it lives.
- **Items-screen TopBar:** the marker lives in the sub line alongside the counts, reading `4 items · 1 member · 🌐 Public` — a separator dot, the globe, and a visible _"Public"_ label (the visible word is its own accessible text, so no extra hidden label is needed).

It is not rendered on the public `/p/` page itself — a signed-out reader is already on the public surface and doesn't need telling. Private lists render no marker.

### Publish / unpublish and copy link

Publishing lives in the per-list `⋮` overflow sheet (reachable from the Lists-screen row and the Items-screen TopBar). The sheet gains a **Make public** / **Make private** row whose label reflects current state, and — when the list is public — a **Copy public link** row. Both sit with the management actions, **above** the destructive Leave/Delete entries (the button-order rule: backward/destructive stays last).

**Copy-link convention (established here — Cairn's first clipboard affordance).** Tapping **Copy public link** copies the list's public URL (`<origin>/p/<list_id>`) to the clipboard and gives **visible confirmation**: the row briefly swaps to a _"Copied"_ state (or a short snackbar). A silent copy is a least-surprise violation — the feedback is required, not optional, and any future copy affordance should follow this same label-plus-visible-confirmation shape. Nothing other than the bare link is copied (no preview text, no attribution).

### Public read-only screen (`/p/<list_id>`)

The link opens a standalone read-only page, outside the signed-in shell. It shows the list name, description, and items in ranked order with their score badges — and **nothing interactive**: no vote controls, no add-item FAB, no overflow menu, no member avatars or attribution, and no public marker. The TopBar shows a non-interactive Cairn wordmark/glyph (so the page is recognisably Cairn) and **no back button** — a signed-out stranger has no back target. Colour and type come from tokens and global rules (list name → the global title style, section rules → `var(--rule)`), never literals. When the link points at a list that is private, soft-deleted, or unknown, the page shows a single generic _"list not available"_ state (the `EmptyState` pattern) — it never distinguishes private from missing.

## Other surfaces

A few smaller patterns, pinned down so they stay consistent:

- **Empty list.** A list with no items shows a friendly empty illustration and an "Add the first item" call to action. No vote controls are rendered for non-existent items.
- **Empty lists screen.** A user with no lists yet sees a brief explainer and a "Create your first list" call to action.

## Button order in pairs

When two buttons sit side-by-side at the bottom of a sheet, dialog, or card, **right is the more committal action; left is the more backward / less committal one**. The right-side action is the one the screen exists to perform. The left-side action is the escape, the dismissal, or the more destructive option that takes the user _out_ of the current context.

Concretely:

- `[Cancel] [Delete]` on a delete-confirmation sheet — the screen exists to delete; Delete is the forward action and goes right.
- The item overflow sheet applies the same logic vertically rather than as a pair: **Edit** sits above **Delete**, so the destructive action stays last (here: lowest) — Edit advances into the editor (more committal), Delete reverses the item's existence (more destructive).
- `[Decline] [Accept]` on an invite row — Accept advances into the list (forward); Decline dismisses (backward).

This applies to button pairs only. Single primary buttons (e.g. **Save** on the edit screen) are placed in the top-right of the top bar per platform convention.

## CSS layout conventions

These patterns were settled during implementation and must be followed on every new screen. They are not repeated in individual plan tasks — read this section when building any UI.

### Where CSS lives: layout local, visual global

The screen inventory was first prototyped by copy-pasting CSS out of the JSX
design refs, which left every component carrying its own near-duplicate
font/color rules. Those drift apart over time (member names at 14 px in one
file, 15 px in another, 15.5 px in a third; section-label padding ranging
4–18 px) and there is no single source of truth for any visual decision. The
convention that replaces that mess:

- **Layout stays local.** A component's scoped `<style>` block holds only
  layout: flex/grid, `gap`, positioning, structural sizes, `overflow`, and the
  spacing that arranges _this_ component's pieces. Layout is inherently about a
  component's own composition, so it belongs with the component.
- **Visual styling is global.** Color, `background`, border color,
  `font-family`, `font-size`, `font-weight`, `letter-spacing`,
  `text-transform`, and `line-height` live in the global stylesheets
  (`typography.css`, `tokens.css`), keyed off the semantic tag (`h1`, `h2`,
  `h3`, `ul`, `p`, …). A scoped rule that sets any of these is a code smell —
  extract it. There is one home per visual role, and every screen inherits it.
- **Variants are global classes, not scoped rules.** When two genuinely
  different looks of the same tag are needed (say two `<ul>` treatments, or a
  sheet-title `<h2>` versus a section-label `<h2>`), introduce a class for the
  variant — but define that class _globally_ so any component can opt in. The
  smell is never "a class exists"; it is "a _local_ rule defines a visual
  look." A legitimate scoped block is layout-only; the moment it carries a
  color or a font size, that declaration wants to be global — on the tag, or
  on a global variant class.

When homogenising or refactoring, do **not** anchor on "match each page's
current look." Accidental drift should converge on one global value, accepting
the deliberate visual changes that follow. The goal is one source of truth per
visual role, not the preservation of per-page quirks.

#### Type roles

`typography.css` defines the full set of type roles. A screen reaches a visual
look by using the matching tag or global class — never by setting `font-size`,
`font-weight`, `letter-spacing`, or `text-transform` in a scoped block. The
roles:

- `h1` — screen / TopBar title (Newsreader serif).
- `h2` — section title. Newsreader serif, 1.125 rem / 500 / `var(--ink-soft)`,
  **normal-case** (see the label/title note below).
- `h3` (+ `.row-title`) — sub-heading / row title weight.
- `.t-hero` — empty-state heading (Newsreader, 1.5 rem).
- `.t-sheet` — bottom-sheet title. Used on an `<h2>`; identical to the section
  `h2` but with full `var(--ink)` for contrast on the sheet background.
- `.identity-name` — a person's display name (members, inbox, profile).
- `.identity-handle` — a person's public `@username`, rendered beside or beneath
  their display name. Muted (`var(--stone)`) at the 1 rem caption floor — set
  apart from `.identity-name` by colour and weight, not by shrinking below the
  floor. It is **not** `.mono`: a handle is an identity string, not a tabular
  numeric, and `.mono` is numerics-only (see below). The `@` is part of the
  rendered text. Wherever a person appears with a display name, the handle
  disambiguates them (display names are not unique; usernames are). It renders
  in: the **profile sheet** (prominent, directly under the display name — the
  one place it is more than a supporting caption); **members** rows; **vote
  attribution** and **item created/modified attribution**; **invite-picker**
  rows; and **circle** rows. Own-handle display in Settings uses the same role.
- `.body` — default body copy.
- `.caption` — muted secondary / metadata line (1 rem, set apart by colour).
- `.fine` — fine print: the one tier below the 1 rem floor (0.8 rem, `var(--stone)`)
  for attribution lines, the list-meta line, vote labels, and timestamps.
- `.mono` — monospace, **numerics only**: the vote indicator, the
  aggregate-score badge, and bare counts. It is for figures that benefit from
  tabular alignment, not for prose. **Dates and ages are caption prose, never
  mono** — `timeAgo()` output and the circle/blocked "when" labels render in
  the `.caption` / `.fine` roles (a proportional face), because a relative date
  is a sentence ("3 days ago"), not a tabular figure. There is no `.date` role.

**Label vs. title — they are not the same look.** The upper-cased,
`0.06em`-tracked small-stone treatment is the **form-label** look, owned by the
`<Label>` primitive (the caption above a form field). **Section titles (`h2`)
are normal-case** — a serif heading (1.125 rem / 500 / `var(--ink-soft)`), not
upper-cased and not tracked. The two were historically conflated under the word
"label"; a section header is an `h2`, not a `<Label>`. Do not re-introduce
uppercase section headers.

### Semantic structure

Markup carries meaning, so labelled content groups use real sectioning
elements rather than anonymous `<div>`s:

- A labelled content group is a `<section>` whose title is a bare `<h2>` (the
  global `h2` role styles it; no class needed).
- `<header>` is used **only** when the section intro carries more than the
  title — e.g. a sheet whose head is a title plus a subtitle. A section with
  just a title needs no `<header>`; the bare `<h2>` is the head.
- `<footer>` holds trailing notes (a muted explanatory line at the end of a
  section or sheet).
- A single, unlabelled list is **not** sectioned — render the `<ul>`/rows
  directly without a wrapping `<section>` or empty `<h2>`.
- The TopBar middle slot stays a layout `<div>` holding the `<h1>` title and an
  optional `<p>` subtitle as siblings — it is chrome, not a content section.

### Units: rem for the type scale, em for local scaling, px for hairlines

The Settings font-size control multiplies the root `font-size`
(`:root { font-size: calc(16px * var(--font-size-scale)) }` in
`typography.css`). For that control to do anything, sizes must be expressed
relative to that root. A value hard-coded in px ignores the user's font-size
choice entirely — which is why the control currently has no visible effect:
the screens were prototyped in px. So:

- **`rem`** — the default. Use it for `font-size` and for spacing/sizing that
  should scale with the global type scale (text-block padding, gaps,
  max-widths, most component dimensions). One source of truth: the root
  font-size.
- **`em`** — for a sub-element that should track its **local** font-size rather
  than the global scale. The canonical case: an icon next to a text label
  (e.g. inside a button) should grow and shrink with _that label_, so size it
  in `em`. Likewise inline icon↔label gaps and padding that should hug text at
  whatever size it renders.
- **`px`** — for what must **not** scale with text: hairline borders
  (`1px solid`), shadow offsets, and genuinely fixed structural measures. A 1px
  rule is 1px at every font size.

### Tap targets and icon sizing

Every interactive control presents a **minimum 44 × 44 px hit area** — the
WCAG 2.5.5 / Apple HIG floor, chosen for small screens with poor touch
resolution where a smaller target is easy to miss or mis-hit. The glyph drawn
inside that area is the smaller **standard icon size, 24 px**, centred within
the hit area; the gap between glyph and edge is dead space that still taps.

Two sources of truth, so neither number is repeated by hand:

- **`--tap-target: 44px`** (in `tokens.css`) — the hit-area floor. Controls set
  `min-width`/`min-height` to it (e.g. `min-height: var(--tap-target)`), never
  a bare `44px`. It's a _minimum_: content may grow past it.
- **`ICON_SIZE` (= 24)** (in `shared/model/constants.ts`) — the glyph size, a
  TS constant because `<Icon size={…}>` takes a number prop, not CSS. Use
  `size={ICON_SIZE}` rather than `size={24}` for any standard control icon
  (chevrons, top-bar actions, the ⋮ More button, nav-row leads).

The floor is **embedded in the icon-button components** so call sites don't
re-implement it. Reach for these rather than hand-rolling a `<button>` around
an `<Icon>`:

- **`<IconButton>`** (`basic/`) — a transparent square icon button at the
  tap-target floor. Pass `icon="settings"` for the common case (it renders the
  `ICON_SIZE` glyph itself); fall back to a child snippet only for bespoke
  content.
- **`<MoreButton>`** — the ⋮ overflow button (wraps `IconButton`); defaults to
  `ICON_SIZE`.
- **`<RefreshButton>`** — the spinning rotate-ccw refresh button; `ICON_SIZE`.

A control that genuinely can't use these still honours the two sources of truth
directly: the **vote thumbs** in `VoteControl` hand-roll their `<button>` (a
`use:thumbButton` action fires `stopPropagation` synchronously, which Svelte's
delegated `onclick` can't), but each thumb is a `var(--tap-target)` box around an
`ICON_SIZE` glyph — same floor, same glyph size, just not via `IconButton`.

Glyphs that are _not_ standalone controls keep their own purposeful sizes (the
small inline globe on the Items subtitle, member-vote avatars, the empty-state
illustration, the FAB's plus) — `ICON_SIZE` is for the recurring control icon,
not a blanket "all icons are 24".

### App shell width and fixed-position elements

The app shell is capped at `--app-max-w: 624px`, centered with `margin-inline: auto`. This token lives in `tokens.css` and is referenced by `+layout.svelte`. It is a **desktop ceiling, not a phone frame**: mobile viewports sit below it and take all the horizontal space they have, while only wider (desktop) viewports actually hit the cap — so the two no longer need to look alike. The value is held in **px, not rem, on purpose**: it must not scale with the user's font-size preference, since an earlier rem-based width shrank the usable real estate on large-screen phones with small fonts.

Fixed-position elements (`position: fixed`) are placed relative to the viewport, not the shell, so naïve `left: 0; right: 0` or `right: 16px` will escape the container on wide screens. The correct patterns:

```css
/* Sheet: span the shell, not the viewport */
left: max(0px, calc(50% - var(--app-max-w) / 2));
right: max(0px, calc(50% - var(--app-max-w) / 2));

/* FAB: 16 px from the shell's right edge */
right: max(16px, calc(50% - var(--app-max-w) / 2 + 16px));
```

These are already in `Sheet.svelte` and `Fab.svelte`. Any new fixed-position element (snackbar, tooltip, keyboard-shortcut bar, etc.) must use the same pattern — **never bare `left: 0` or `right: 16px` on a fixed element**.

### Scroll model and the screen bottom gutter

Every authenticated screen uses **one** scroll model: the `.screen` is a flex
column with `min-height: 100%`, content grows it past the viewport, and the
whole screen — TopBar included — scrolls at the document level. Screens do
**not** pin the TopBar with an inner `overflow-y: auto` scroller; that variant
was retired so the app scrolls consistently everywhere. (The sole exception is
`AvatarCropScreen`, a fixed-viewport crop UI that marks its root
`class="screen no-gutter"`.)

The bottom gutter is applied **once**, in the `(app)` shell layout
(`routes/(app)/+layout.svelte`), as `.screen:not(.no-gutter) { padding-bottom:
var(--fab-clearance) }` — so no screen needs to repeat it. It keeps the last
row/control off the viewport edge (a flush edge reads as "more below") and, on
FAB screens, doubles as the clearance that keeps the last row from hiding under
the floating button.

### Full-height screens and vertical centring

`.screen` and `.screen-body` are **global layout primitives**
(`src/lib/shared/styles/layout.css`, imported in the root layout), not
per-screen rules — they were duplicated on every screen, so they live in one
place like the `.rows` divider model. Every screen follows the same shape:

```svelte
<div class="screen">
	<TopBar … />
	<div class="screen-body"><!-- loading / empty / loaded all live here --></div>
	<!-- fixed overlays (FAB, snackbars, sheets) stay OUTSIDE .screen-body -->
</div>
```

`.screen` gives the flex column + `min-height: 100dvh`; `.screen-body` is the
single growing region that holds **all** of a screen's states (don't tag only
the loading branch). Per-screen padding, gaps, and column layout are added
locally on `.screen-body`. Splash variants (auth pages) add only their deltas
(centring, padding) on top of `.screen`; `AvatarCropScreen` opts out of the
bottom gutter with `class="screen no-gutter"` and names its bespoke region
`.crop-stage`. Sheets don't need a body class — the `Sheet` component's own
container is the padded, scrollable body.

```css
/* layout.css — the global primitives */
.screen {
	display: flex;
	flex-direction: column;
	min-height: 100dvh; /* dvh, not vh — shrinks when iOS Safari chrome expands */
}
.screen-body {
	flex: 1; /* the growing region below the TopBar; screens add padding locally */
}
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}
```

### TopBar visual spec

Every `<TopBar>` renders with:

- Newsreader serif, 1.375 rem (22 px), weight 500, letter-spacing −0.01 em for the title
- `min-height: 56px`; padding 12 px top/bottom / 0.8 rem sides (plus safe-area insets). The side padding is tight because the action buttons are wide — they're `--tap-target` (44 px) hit areas around `ICON_SIZE` glyphs, which also set the bar's effective height past the 56 px floor.
- `border-bottom: 1px solid var(--rule)`

The TopBar uses `display: flex; align-items: flex-start; gap: 10px` (flex-start, not center, so a wrapped two-line title grows downward and the action buttons stay pinned to the top). The title div has `flex: 1; min-width: 0`, so the leading element and title are visually adjacent. Action icons handed into the `left`/`right` slots (`IconButton`, `MoreButton`, `RefreshButton`) get the `--tap-target` floor from a slot-scoped rule. Optional props:

- **`left?: Snippet`** — rendered in the leading slot. When provided, it replaces the back button (`showBack` is ignored). Use this for root screens that need a brand element rather than a back arrow (e.g. `<CairnGlyph>` on the Lists screen).
- **`sub?: string`** — a secondary line rendered directly below the title; the `.caption` role (1 rem, `var(--stone)`).

These styles live inside `TopBar.svelte` — callers do not re-apply them. Screens that are the navigation root (e.g. Lists) pass a `left` snippet instead of `showBack={false}`.

Inside the authenticated app, screens use `<AppTopBar>` instead of the raw `<TopBar>`. It's a thin wrapper that defaults `sub` to _"Signed in as Alice"_ (read from the profile state) when the caller doesn't supply one, so a screen with only a title — _Settings_, _Edit profile_, _Deleted lists_, _Crop_ — keeps the same two-line layout as screens that do have a real subtitle, instead of looking visually shorter than its neighbours. Pass `sub` explicitly to override (e.g. `<AppTopBar sub="3 items · 2 members">`), or use the raw `<TopBar>` if the screen is outside the signed-in context (auth pages).

### Row navigation pattern

When a list row has a primary label and a trailing chevron that both navigate to the same destination, **wrap them in a single `<button>`** — not two separate elements. Two buttons leave a dead tap zone between them.

```svelte
<button class="row-nav" onclick={navigate}>
  <h3 class="row-title">{item.name}</h3>
  <span class="chevron"><Icon name="chevron-right" size={ICON_SIZE} /></span>
</button>
```

```css
.row-nav {
	display: flex;
	align-items: flex-start; /* NOT center — pins chevron to first line when name wraps */
	gap: 12px;
	width: 100%;
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
}
.row-title {
	flex: 1;
	min-width: 0;
}
.chevron {
	flex-shrink: 0;
}
```

In practice this pattern is the shared **`<NavRow>`** (and its sibling
**`<AccordionRow>`**) — prefer them to re-rolling the markup. They implement
the tap-target rule above: the chevron is the `ICON_SIZE` glyph in a square
`--tap-target` box, the lead/trailing/chevron each centre within a
`--tap-target`-tall band, and the title's first line is centred on that same
midline via `padding-block: calc((var(--tap-target) - 1lh) / 2)`.
`align-items: flex-start` keeps the chevron and any lead/trailing pinned to the
title's first line rather than drifting to the midpoint of a wrapped name. A
caller (e.g. the Lists card) that pins a per-row ⋮ beneath the chevron aligns
it by giving the ⋮ `right` = the row button's `padding-right`, since chevron
and ⋮ are both `--tap-target` boxes around `ICON_SIZE` glyphs.

### Row separators

A divider between adjacent sibling rows — data rows, action-menu rows, or nav-rows — is **presentational, not semantic**: render it as a `1px solid var(--rule)` border on the adjacent siblings (`.rows .row`, `.menu > li + li`, `nav-row + nav-row`), never as an `<hr>`. `<hr>` is invalid as a direct child of `<ul>` and carries no useful document semantics between sibling rows, so the codebase uses no `<hr>` and keeps no global `hr` reset.

**An itemised group is fully ruled — a rule above the first item and one below the last, not just between.** Any set of repeated sibling rows (a list of items, an action menu, a run of nav-rows) reads as one closed band: a hairline opens the group above its first row and another closes it below its last, in addition to the inter-row dividers. Don't suppress the leading or trailing rule to "close against the screen edge" — that leaves the group looking unfinished and inconsistent with its neighbours. Two equivalent mechanisms produce the band:

- **Container + per-row bottom** (the `.rows` data-list model): the container carries `border-top` and every row carries `border-bottom`, so the last row's own bottom rule closes the set. Every row gets a `border-bottom` — never a `:last-child { border-bottom: none }` exception.
- **Container band + inter-row top** (the `.menu` / `.nav-rows` model): the container carries both `border-top` and `border-bottom` (the band), and `li + li` / `nav-row + nav-row` draws the dividers between.

### Cursor convention

- `cursor: pointer` — **navigation and explicit call-to-action buttons only** (links, FABs, row-nav buttons, CTA buttons). The pointer (hand) signals "this takes you somewhere or submits something."
- `cursor: default` (the arrow) — **interactive elements that don't navigate**: expand/collapse toggles, disabled states, non-link buttons that operate in place. Browsers render buttons as `auto`/`default` by default; don't add `cursor: pointer` unless the element genuinely navigates.

### Empty-state copy and style

One pattern is used everywhere, implemented by the shared `<EmptyState>`
component (`web/src/lib/shared/components/`). A single empty-state look across
every screen is a deliberate consistency choice — utility screens (e.g.
Blocked) use the same illustrated treatment as first-run screens (e.g. Lists),
just without a CTA. Structure:

- A centered 96 × 96 px circle: `background: var(--paper-alt); border: 1px dashed var(--stone-lt); border-radius: 99px`. Contains an icon (`<Icon>`) or a brand illustration (e.g. `<CairnGlyph size={44} color="var(--stone)" />`).
- A heading: Newsreader 1.5 rem (24 px), weight 500, `var(--ink)`, letter-spacing −0.01 em.
- Body copy: the `.body` role — 1 rem (16 px), `var(--ink-soft)`, line-height 1.5, max-width 280 px.
- An optional CTA button: `background: var(--ink); color: var(--paper)`, border-radius 12 px, padding 12 px 22 px, weight 600, 0.875 rem (14 px), with a leading icon. Rendered only on screens with a primary first-run action (Lists, Items); omitted elsewhere.

Heading, body, and CTA are each optional — a screen supplies only the parts it
needs (e.g. Trash and Blocked render the disc + heading with no CTA).

### Shared components

Recurring bits of markup live as shared components in
`web/src/lib/shared/components/` rather than being re-rolled per screen. As
well as `<EmptyState>` (above) and `<NavRow>` (the chevron nav-row), two more
were extracted during this work:

- **`<Badge>`** (a `basic/` primitive, peer of `<Button>`) — the small
  pill/figure shown beside a name or count: tones `primary` (filled
  earth/accent — the attention/notification count, e.g. the Settings invites
  count and the multi-invite banner; same `primary`↔`var(--accent)` mapping as
  `<Button tone="primary">`), `soft` (outlined muted fill — informational
  counts like the Privacy circle / blocked totals), and `score` (the
  aggregate-score badge, sage for positive and ember for negative; a score of
  zero renders no badge). This reverses the earlier "no shared `<Badge>` in v1"
  non-requirement — screens use `<Badge>` instead of hand-rolled badge spans.
- **`<InviteCard>`** — the invite row used by the inbox list and the
  single-invite banner, so both render identical invite markup.

## Not decided

These are deferred — they need a design pass but aren't blocking v1.

- **Exact typography for the indicator.** Whether `+++` should grow visually with magnitude (light → bold) within the fixed-width slot is a polish question for the implementation, not a v1 contract.
- **Haptics.** A small tick on each tap would be nice. Defer.
- **Animation.** A subtle slide for the accordion unfold and for vote-state transitions would be nice. Defer.
- **Accessibility labels.** Every control needs a screen-reader label ("Downvote _Casablanca_, currently rated +2 by you, tap to lower to +1"). The exact phrasing is for the implementation pass, but the requirement is fixed: every button is reachable and labeled.
