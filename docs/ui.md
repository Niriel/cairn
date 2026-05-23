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

A floating button creates a new list. Editing a list's name or description, and deleting a list, are not yet designed — see "Not decided" below.

## Items screen

Inside a list. Each row shows the item name and the vote control.

```
Item name here, possibly long…             [👎] [ --- ] [👍]
Another item                                [👎] [  =  ] [👍]
The one everyone loves                      [👎] [ +++ ] [👍]
```

**Item name on the left, vote controls on the right.** The item is the content; the vote is the action, and putting controls on the trailing edge follows the convention people are used to from list-shaped apps. It also puts the controls inside the natural arc of the right thumb on a phone.

Long names truncate with an ellipsis before they would push the vote controls off-screen. The vote controls' total width is fixed and never changes between rows.

### The accordion unfold

**Tap an item row** (anywhere except the vote control) to unfold its full panel inline. Tap again on the same item to close. **Only one item is unfolded at a time per list** — opening one closes any other that was open. The unfold pushes the items below it down; it doesn't overlay or popover.

What's inside the unfolded panel:

- **Notes** — the full text of the item's notes, if any. Plain text, soft-wrapped.
- **Per-member votes** — `Alice +3 · Bob +1 · Carol −2`. Reads at a glance; uses the same red/muted/green coloring as the indicator.
- **Attribution** — `Added by Alice on 1 May 2026.` If the item has been edited since, also: `Last edited by Bob on 3 May 2026.` Dates are formatted in the user's locale.
- **Edit and Delete buttons** — at the bottom of the panel. Edit opens a small form for name and notes; Delete soft-deletes after a confirmation. Both are available to any list member.

The vote control on the row stays interactive while the panel is open — you can still upvote/downvote without closing the panel. This matters because the per-member breakdown updates live as you vote, which is part of the satisfaction.

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
| 0    | `=`     | muted (default) |
| +1   | `+`     | green           |
| +2   | `++`    | green           |
| +3   | `+++`   | green           |

The indicator's slot is **fixed-width** — wide enough to hold `+++` without truncation. `=` and the single `+`/`-` characters are centered within that slot. This means rows do not reflow, shimmer, or shift as votes change. Color is applied to the characters, not the slot background, so the layout reads as stable even when many items are visible at once.

The `=` state doubles as "I haven't voted." Conceptually, "neutral" and "haven't considered yet" are similar enough that splitting them into separate UI states is more cognitive load than it's worth, and the database stays simple — neutral is row absence, not a stored zero. (See `data-model.md` on the `votes` table.)

## Vote interaction

Tapping a thumb **nudges the vote by one** in that direction.

- Tap thumb-up at `=` → `+`
- Tap thumb-up at `+` → `++`
- Tap thumb-up at `++` → `+++`
- Tap thumb-up at `+++` → stays at `+++` (clamped; no wrap)
- Tap thumb-down at `+++` → `++`
- ...and so on, symmetrically, down to `---`

Reasons:

- **Relative nudging matches the +/- mental model.** People expect that pressing "up" makes things go up by one.
- **Clamping at the ends is safer than wrapping.** Wrapping `+++ → ---` on an extra tap is a footgun that's hard to recover from. If a user wants to flip sides, the opposite thumb is right there and the path through `=` is short.
- **One tap = one vote unit.** This keeps the speed of binary voting for the common case (one tap to express interest), while leaving room for stronger feelings when they exist.

At the extremes (±3), the button in the clamped direction renders at 35% opacity with `cursor: default` and emits no event when tapped. The opposite button remains fully active. This matches the design spec in `design/cairn-ui.jsx` `VoteControl`.

## Color

Three semantic colors used by the vote indicator and the per-member vote breakdown:

- **Red** for negative values. Should be a calm, readable red — not the alarming kind. Same red is reused elsewhere only for actually destructive actions (delete confirmations).
- **Green** for positive values. Same caveat — readable, not aggressive.
- **Muted** (the default text color, but slightly softened) for `=` and for the "haven't voted" state.

The thumb buttons themselves are not colored; they're rendered in the platform's standard icon-button style. Coloring the buttons too would compete visually with the indicator and add no information.

The colors must remain readable in both light and dark themes. Concrete values are defined as CSS custom properties in the app's theme; this document only fixes the semantics.

## Viewport, safe areas, and browser chrome

Cairn is a web app, but on a phone it lives inside a viewport surrounded by system UI: a status bar at the top, a gesture pill or three-button nav at the bottom on Android, a home indicator on iOS, a virtual keyboard whenever a text field has focus. On desktop it lives inside a browser tab or a standalone window. The layout has to behave correctly on all of these without us drawing any of it ourselves.

The app uses three CSS techniques together:

- **`viewport-fit=cover`** in the meta tag, so the page extends edge-to-edge on devices with safe-area insets (notches, rounded corners, the home indicator).
- **`env(safe-area-inset-*)`** for the actual insets. Every screen's outer container reserves `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` of padding so content doesn't sit underneath the notch or the home pill. Bottom sheets do the same on the bottom edge — the delete-item confirmation and the list overflow sheet both need it, so destructive buttons aren't ever overlapped by system gestures.
- **`100dvh` (dynamic viewport height)** instead of `100vh` for full-height layouts. `dvh` shrinks when iOS Safari's address bar expands, which keeps the FAB visible instead of clipped behind chrome.

The floating action button is positioned with `position: fixed; bottom: calc(env(safe-area-inset-bottom) + 16px); right: 16px;`. Never a bare `16px` on `bottom`. The same pattern applies to the snackbar.

The virtual keyboard is the trickiest piece. The web platform's [VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) is the source of truth: when the keyboard opens, the visual viewport shrinks. The app listens for `visualViewport.resize` and adjusts the layout so the focused text field stays visible above the keyboard. CSS-only approaches (e.g. `100dvh`) handle most cases on Android Chrome but fail on iOS Safari, where the keyboard can sit _over_ the page without resizing the layout viewport — the JS path is required.

When the app is running as an installed PWA (`display: standalone` in the manifest, see `architecture.md`), there's no browser address bar and no tab strip — the page is the whole window. When it's running in a browser tab, the address bar is part of the user's chrome, and we don't try to hide or compete with it. Either way, our work begins inside the viewport the browser hands us; we don't draw OS chrome and we don't pretend it isn't there.

This is invisible work — done right, the user never notices. Done wrong, the FAB is half-eaten on some devices, the keyboard hides the input on iOS, and the home indicator overlaps a bottom sheet's destructive button.

## Navigation and back

Every back affordance — the in-app **←** in the top bar, the Android hardware/gesture back, the iOS Safari swipe-back, and the desktop browser back button — must do the same thing. To the user these are one action; the moment they diverge ("the back button broke") is the moment trust in the app drops.

The principle: **the back stack is the source of truth, and every visible thing the user can dismiss puts an entry on it.**

Concretely:

- **Route changes push history.** SvelteKit's router does this by default for `goto()` and `<a href>` — every screen transition (Lists → Items → Item details → Edit, etc.) adds an entry. Browser back and Android system back call `history.back()`, which SvelteKit handles as a route change in reverse. The in-app top-bar **←** also calls `history.back()` (never a hard-coded previous route), so it cannot disagree with system back.
- **Dismissible overlays push history too.** Bottom sheets (delete-item confirmation, list overflow menu, invite picker, avatar source sheet), modal dialogs, the profile sheet, and the unfolded accordion panel all push a state on open and listen for `popstate` to close. The user expects back to close what they just opened; system back and the sheet's own Cancel are then equivalent. Without this, back skips past the overlay and pops the user out of the screen entirely — the bug usually reported as _"the back button is broken."_
- **The Lists screen is the back-stack root.** Pressing back from there does nothing inside the running app. On Android-installed-PWA the OS handles it (typically closes the app), which is fine — we don't fight the platform. On iOS-installed-PWA (`display: standalone`) there is no system back gesture at all, so the in-app **←** is the only path; the design's top-bar arrow must always be reachable.
- **The auth callback URL replaces history rather than pushing.** Hitting back from the first post-login screen must not return the user to `cairn.<domain>/auth/callback?token=…`, which is single-use. Use SvelteKit's `goto(target, { replaceState: true })` from the callback handler.
- **Transient surfaces don't push history.** The 6-second undo snackbar dismisses on its own timer; it doesn't consume a back press. Pressing back during the snackbar does whatever back means at that point in the route — it doesn't dismiss the snackbar in lieu of navigating.
- **Accept invite navigation pushes**, so back from the freshly-joined list returns to the inbox / lists screen the user came from, not out of the app.
- **Back never makes a destructive choice on the user's behalf.** Back from a delete-confirmation sheet dismisses the sheet (same as Cancel, never Delete). Back from Edit item with unsaved changes opens a "Discard changes?" sheet, which is itself a dismissible overlay — completing the recursion. Back from the Delete-account screen leaves the typed-confirmation state intact but does not submit.

Playwright should exercise this. Each user-journey spec (`testing.md`) should include a system-back press at every transition that proves back goes where the user expects — both for full-route transitions and for at least one dismissible overlay (the delete-item sheet is a good canary).

## Settings

A Settings screen, reachable from the **gear icon** in the top-right of the Lists screen. (The kebab on individual list rows is unchanged — that's still the per-list long-press menu.) The screen is the canonical hub: every other Settings-shaped surface ladders back to it.

A profile chip sits at the top: current avatar (initials disc or photo), display name, chevron. Tapping it opens **Edit profile** — see "Avatars" below. Below the chip, the screen is grouped into named sections.

**Appearance** holds the two device-local preferences:

- **Theme.** Light / dark / system. Default: system. The app re-themes immediately on change; no restart.
- **Font size.** Five steps: XS, S, M, L, XL. Default: M. Implemented as a single scale factor applied to the root `font-size` (with all type sizes in `rem`) so every text style scales together and the layout stays balanced.

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

Cairn renders the same `<Avatar>` everywhere a user appears (item attribution, members list, profile sheets, the Settings profile chip). The component branches on `profiles.avatar_version`: `0` (the default) renders the existing coloured initials disc; any positive integer renders an `<img>` with `src="/avatars/{uid}.webp?v={avatar_version}"`. See `avatars.md` for the storage decision, the cache-busting URL pattern, and the upload sidecar.

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

The "Deleted user" tombstone gets a specific visual treatment wherever an avatar would normally render: a flat gray disc, no initials, the display name "Deleted user" in muted italic. This appears on item attribution lines on the accordion, on members lists (rare — the tombstone is never an active member), and on the trash screen for any item the deleted user originally added.

For the data model behind all of this, see `account-deletion.md`.

## Invites & circles

The full feature is documented in `invites.md`; this section covers the UI surfaces it affects. Three new screens, plus changes to the lists screen and the long-press menu on members.

### Inbox row on the Lists screen

When the user has at least one pending invite, a single row appears at the top of the Lists screen, above the list of lists:

- One pending invite: _"Alice invited you to **Stuff to read**"_ with two inline affordances — **Accept** (sage) and **Decline** (muted).
- More than one: _"3 pending invites"_ with a chevron; tapping opens the full inbox screen.

The row uses a slightly tinted background (warm cream in light mode, slate-700 in dark) to distinguish it from list rows without competing for attention. It disappears entirely when the inbox is empty — invites are not a permanent UI element.

### Invites inbox screen

Reachable from Settings → Invites or by tapping the multi-invite row on the Lists screen. Plain list of pending invitations, sorted newest first. Each row:

- Inviter's display name and avatar.
- _"invited you to"_ in muted text.
- The list name, in the same weight as a list-row title.
- An **Accept** button (sage) and a **Decline** button (muted), side by side.

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

Reachable from Settings → Privacy → Your circle. A single list of **People in your circle** — those you've added. Each row: avatar, display name, a small action affordance to remove (with confirmation: _"Stop accepting invites from Bob?"_).

The screen does _not_ show "people who have you in their circle." Each user's circle is their own private permission setting on themselves — surfacing it to the people listed in it would turn a private setting into a quasi-social signal, which is the opposite of the intent. See `circles.md`.

At the top of the list, a small _"What is a circle?"_ link opens a brief explainer sheet (one paragraph; same content as the top of `circles.md`). The link is always present — a circle is subtle enough that even returning users may want to re-check.

At the bottom, an **Add by email** field. Typing an email and confirming triggers the mutual email-add path (see `invites.md`). The success toast is generic — same on success, on "Bob doesn't exist," on "Bob blocked you" — to preserve Bob's privacy.

The screen is empty-state-friendly: a new user sees the brief explainer above the empty add-by-email field. No graphical empty state.

### Blocked screen

Reachable from Settings → Privacy → Blocked. A plain list of blocked users (avatar + display name) with an **Unblock** action on each row. Empty state: _"You haven't blocked anyone."_ No add-by-email field here — blocking happens from a profile screen, not by typing an email.

### Profile screen (sheet)

Tapping any user's avatar or name (in a list members screen, the inbox, or anywhere else a user appears) opens a profile sheet. The sheet is modal, dismissed by tap-outside or a chevron-down handle.

Contents:

- Large avatar at top.
- Display name in the same weight as a screen title.
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

Add to circle and Remove from circle are quiet — no confirmation, no animation drama. Block and Unblock prompt for confirmation (_"Block Bob? He won't be able to invite you to any list."_). Cancel pending invite is also quiet.

Tapping your **own** avatar bounces to Settings rather than opening a profile sheet. There is no "my profile" screen in v1.

### Invite picker (bottom sheet)

Opened from the **Members** screen of a list, by tapping the **Add member** affordance. A bottom sheet sliding up to roughly 75% of the screen height, with three sections, top to bottom:

1. **Your circle** — people in the viewer's circle, excluding existing members of the current list. Each row: avatar, display name, a tap-to-invite affordance. A single tap sends the invite; the row briefly shows a check or the generic _"Couldn't send"_ error toast.
2. **People you share other lists with** — live co-members on the viewer's other lists, deduplicated, excluding circle members already in section 1 and existing members of the current list. Same row shape as above.
3. **By email** — a text field at the bottom of the sheet. Submit triggers the email-invite path. Success and failure show the same generic toast as the tap-to-invite rows.

Display names and avatars only — **no emails are shown** anywhere in the picker, on any row, ever. Email is only used in the manual text field at the bottom, and the user types it themselves; it's never echoed from the database.

If a section is empty (e.g. the viewer has no one in their circle yet), the section header and rows simply don't render — the next section takes their place. We don't show empty-state stubs in the picker; the email field is always available as a fallback.

For the data model and the policy/block check sequence behind all of this, see `invites.md`.

## Dates

Dates are formatted **day-month-year, with the month written out**: `1 May 2026`, `14 Apr 2026`. No US `5/1/2026`, no ISO `2026-05-01` in user-facing text. This is the format used in the accordion attribution line ("Added by Alice on 1 May 2026") and anywhere else a date appears.

The format is fixed in copy — it does not follow the device locale. Cairn is a small private app for friends, not a localized product; one consistent format is clearer than locale guessing, and `1 May 2026` reads naturally to English speakers everywhere. If we later add real localization, the date format follows the language file like any other string.

Times of day are not shown anywhere in v1.

## Vote indicator typography

The seven-step indicator is rendered with **plain ASCII characters** (`---` `--` `-` `=` `+` `++` `+++`) in a fixed-width monospace font. We considered weight-scaled variants and dot-bar visualizations during design and rejected both: the ASCII version is the visual signature of the app, instantly readable, and survives in every font fallback chain. The font weight is constant (600); only the color and the character count change between steps.

## Aggregate score on the row

Each item row shows an aggregate-score badge next to the name when the score is non-zero — small, monospace, sage for positive and ember for negative. This is a v1 decision, reversing the earlier "not shown until v2" plan: the badge is small enough not to compete with the per-user vote control, and it gives a quick at-a-glance read of group sentiment that makes the list materially more useful. A score of exactly zero renders no badge (clean, no clutter for items everyone is neutral on).

The user's _own_ vote remains the primary signal on the row (the indicator on the trailing edge); the aggregate is a secondary read on the leading edge. The two never compete because they use different weights and different positions.

## Trash & undo

Soft delete is universal in Cairn (see `data-model.md`): items, lists, and list memberships are marked with `deleted_at`, never removed. The UI surfaces this in two places — a transient undo, and a per-list trash.

### Undo snackbar

Whenever a user soft-deletes an item, a snackbar appears at the bottom of the items screen for **6 seconds**: _"Deleted 'Bringing Up Baby' · Undo"_. Tapping Undo clears the `deleted_at` and the row pops back into place. After the snackbar dismisses, the item is in the trash, recoverable from there. The snackbar replaces — not stacks with — any previous one; the most recent delete wins.

While the snackbar is up, the FAB is hidden. The two share the bottom-right corner, and the Undo affordance must not be covered by the "add" button — undo _is_ the action we want the user to take in those six seconds. The FAB returns when the snackbar dismisses.

The same pattern applies to deleting a list (snackbar on the lists screen) and to removing a member (snackbar on the members screen).

### Trash screen

Each list has a **Trash** entry in its overflow menu (the long-press / `⋮` sheet). Opening it shows the list's soft-deleted items, ordered most-recently-deleted first. Each row shows the item name, a faint _"deleted by Bob, 3 May 2026"_ attribution, and a single **Restore** button. Tapping Restore clears `deleted_at` and returns the item to the live list at its original position in the sort.

There is no "empty trash" action. Hard deletion is not exposed in the UI; nothing in v1 ever calls `DELETE` on items. If we ever add a server-side garbage collection for very old deletions, that's a backend decision (see the open question in `architecture.md`), not a user-facing one.

A trashed list is reachable from a separate **Trash** entry in Settings (one trash per user, listing all deleted lists they were a member of). Restoring a list returns it to the lists screen with all its members and its trash intact.

The trash is not a feature we promise users — it's a safety net. The copy in delete confirmations should reflect that without making promises about retention windows: _"Bob and Carol will no longer see this item. You can restore it from this list's trash."_ No "for 30 days," no countdown — just the affordance.

## Other surfaces

A few smaller patterns, pinned down so they stay consistent:

- **Empty list.** A list with no items shows a friendly empty illustration and an "Add the first item" call to action. No vote controls are rendered for non-existent items.
- **Empty lists screen.** A user with no lists yet sees a brief explainer and a "Create your first list" call to action.

## Button order in pairs

When two buttons sit side-by-side at the bottom of a sheet, dialog, or card, **right is the more committal action; left is the more backward / less committal one**. The right-side action is the one the screen exists to perform. The left-side action is the escape, the dismissal, or the more destructive option that takes the user _out_ of the current context.

Concretely:

- `[Cancel] [Delete]` on a delete-confirmation sheet — the screen exists to delete; Delete is the forward action and goes right.
- `[Delete] [Edit]` on an item card — Edit advances into the editor (forward, more committal); Delete reverses the item's existence (more destructive, more backward, goes left).
- `[Decline] [Accept]` on an invite row — Accept advances into the list (forward); Decline dismisses (backward).

This applies to button pairs only. Single primary buttons (e.g. **Save** on the edit screen) are placed in the top-right of the top bar per platform convention.

## CSS layout conventions

These patterns were settled during implementation and must be followed on every new screen. They are not repeated in individual plan tasks — read this section when building any UI.

### App shell width and fixed-position elements

The app is constrained to `--app-max-w: 26rem` (≈ 416 px), centred with `margin-inline: auto`. This token lives in `tokens.css` and is referenced by `+layout.svelte`.

Fixed-position elements (`position: fixed`) are placed relative to the viewport, not the shell, so naïve `left: 0; right: 0` or `right: 16px` will escape the container on wide screens. The correct patterns:

```css
/* Sheet: span the shell, not the viewport */
left: max(0px, calc(50% - var(--app-max-w) / 2));
right: max(0px, calc(50% - var(--app-max-w) / 2));

/* FAB: 16 px from the shell's right edge */
right: max(16px, calc(50% - var(--app-max-w) / 2 + 16px));
```

These are already in `Sheet.svelte` and `Fab.svelte`. Any new fixed-position element (snackbar, tooltip, keyboard-shortcut bar, etc.) must use the same pattern — **never bare `left: 0` or `right: 16px` on a fixed element**.

### Full-height screens and vertical centring

Screens that can show an empty state should be flex columns that fill the viewport so the empty state can be centred:

```css
.screen {
	display: flex;
	flex-direction: column;
	min-height: 100dvh; /* dvh, not vh — shrinks when iOS Safari chrome expands */
}
.content {
	flex: 1; /* fills remaining height below the TopBar */
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

- Newsreader serif, 22 px, weight 500, letter-spacing −0.01 em for the title
- `min-height: 56px`; padding 12 px top / 18 px sides (plus safe-area insets)
- `border-bottom: 1px solid var(--rule)`

The TopBar uses `display: flex; align-items: center; gap: 10px`. The title div has `flex: 1; min-width: 0`, so the leading element and title are visually adjacent. Optional props:

- **`left?: Snippet`** — rendered in the leading slot. When provided, it replaces the back button (`showBack` is ignored). Use this for root screens that need a brand element rather than a back arrow (e.g. `<CairnGlyph>` on the Lists screen).
- **`sub?: string`** — a secondary line rendered directly below the title; 12 px, `var(--stone)`.

These styles live inside `TopBar.svelte` — callers do not re-apply them. Screens that are the navigation root (e.g. Lists) pass a `left` snippet instead of `showBack={false}`.

### Row navigation pattern

When a list row has a primary label and a trailing chevron that both navigate to the same destination, **wrap them in a single `<button>`** — not two separate elements. Two buttons leave a dead tap zone between them.

```svelte
<button class="row-nav" onclick={navigate}>
  <span class="name">{item.name}</span>
  <span class="chevron"><Icon name="chevron-right" size={18} /></span>
</button>
```

```css
.row-nav {
  display: flex;
  align-items: flex-start; /* NOT center — pins chevron to top when name wraps */
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.name { flex: 1; min-width: 0; }
.chevron { flex-shrink: 0; }
```

`align-items: flex-start` is required so the chevron stays at the top of a multi-line name rather than drifting to the vertical midpoint.

### Cursor convention

- `cursor: pointer` — **navigation and explicit call-to-action buttons only** (links, FABs, row-nav buttons, CTA buttons). The pointer (hand) signals "this takes you somewhere or submits something."
- `cursor: default` (the arrow) — **interactive elements that don't navigate**: expand/collapse toggles, disabled states, non-link buttons that operate in place. Browsers render buttons as `auto`/`default` by default; don't add `cursor: pointer` unless the element genuinely navigates.

### Empty-state copy and style

Two patterns are used, depending on the screen's design spec.

**Simple empty state** — for utility screens with no illustration: two short lines, the first stating the fact ("No items yet."), the second giving the action ("Tap [icon] to create one."). Colour: `var(--stone)`. Font size: ≥ 22 px. Inline icon hints (the circular FAB replica) use `background: var(--accent); color: var(--paper)` and `border-radius: 50%`.

**Illustrated empty state** — for screens where the first-run experience warrants more visual weight (e.g. the Lists screen). Structure:

- A centred 96 × 96 px circle: `background: var(--paper-alt); border: 1px dashed var(--stone-lt); border-radius: 99px`. Contains a brand illustration (e.g. `<CairnGlyph size={44} color="var(--stone)" />`).
- A heading: Newsreader 24 px, weight 500, `var(--ink)`, letter-spacing −0.01 em.
- Body copy: 14 px, `var(--ink-soft)`, line-height 1.5, max-width 280 px.
- A CTA button: `background: var(--ink); color: var(--paper)`, border-radius 12 px, padding 12 px 22 px, weight 600, 14 px, with a leading icon.

Use the pattern specified by the screen's design JSX in `design/cairn-screens.jsx`.

## Not decided

These are deferred — they need a design pass but aren't blocking v1.

- **Editing and deleting lists.** The lists screen needs an affordance for renaming or deleting a list. Could be a long-press menu, a swipe gesture, or a per-list overflow button. Pending.
- **Exact typography for the indicator.** Whether `+++` should grow visually with magnitude (light → bold) within the fixed-width slot is a polish question for the implementation, not a v1 contract.
- **Haptics.** A small tick on each tap would be nice. Defer.
- **Animation.** A subtle slide for the accordion unfold and for vote-state transitions would be nice. Defer.
- **Accessibility labels.** Every control needs a screen-reader label ("Downvote _Casablanca_, currently rated +2 by you, tap to lower to +1"). The exact phrasing is for the implementation pass, but the requirement is fixed: every button is reachable and labeled.
