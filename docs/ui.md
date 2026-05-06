# UI conventions

This document captures user-interface decisions that affect more than one screen, or that have implications for the data model. The web app's full design isn't here — only the conventions that needed to be settled deliberately and recorded so we don't drift away from them.

Cairn is a Progressive Web App built with SvelteKit. "The app" in this document means the running web app — installed to the home screen on phones, or running in a browser tab on desktop. The conventions below apply identically across both presentations except where called out.

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

| Vote  | Display | Color           |
|-------|---------|-----------------|
| −3    | `---`   | red             |
| −2    | `--`    | red             |
| −1    | `-`     | red             |
| 0     | `=`     | muted (default) |
| +1    | `+`     | green           |
| +2    | `++`    | green           |
| +3    | `+++`   | green           |

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

The buttons stay enabled at the extremes; tapping does nothing visible. We don't gray them out — that's a small visual flicker that costs more than it gains.

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

The virtual keyboard is the trickiest piece. The web platform's [VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) is the source of truth: when the keyboard opens, the visual viewport shrinks. The app listens for `visualViewport.resize` and adjusts the layout so the focused text field stays visible above the keyboard. CSS-only approaches (e.g. `100dvh`) handle most cases on Android Chrome but fail on iOS Safari, where the keyboard can sit *over* the page without resizing the layout viewport — the JS path is required.

When the app is running as an installed PWA (`display: standalone` in the manifest, see `architecture.md`), there's no browser address bar and no tab strip — the page is the whole window. When it's running in a browser tab, the address bar is part of the user's chrome, and we don't try to hide or compete with it. Either way, our work begins inside the viewport the browser hands us; we don't draw OS chrome and we don't pretend it isn't there.

This is invisible work — done right, the user never notices. Done wrong, the FAB is half-eaten on some devices, the keyboard hides the input on iOS, and the home indicator overlaps a bottom sheet's destructive button.

## Settings

A Settings screen, reachable from an overflow on the lists screen. Two preferences in v1:

- **Theme.** Light / dark / system. Default: system. The app re-themes immediately on change; no restart.
- **Font size.** Five steps: XS, S, M, L, XL. Default: M. Implemented as a single scale factor applied to the root `font-size` (with all type sizes in `rem`) so every text style scales together and the layout stays balanced. The scale factor lives on the user's profile (see `data-model.md`) so it follows them across devices.

Larger sizes are not just an accessibility nicety — Cairn is read in cafés, on a couch, with a glass of wine. The defaults should look good at M; L should feel like a proper "large text" mode without breaking any layout.

Both preferences are stored on the `profiles` row, written via PostgREST like any other field. No local-only settings in v1 — if it's worth a control, it's worth following the user.

Below the preferences, Settings has three navigation rows that open dedicated screens:

- **Invites** — pending invitations to lists, with Accept / Decline. See "Invites & circles" below.
- **Privacy** — who can invite you, who's in your circle, who you've blocked. See below.
- **Account** — sign out, delete account.

The **Sign out** action lives in the Account row. **Delete account** is in red, below Sign out, and opens a dedicated screen, not a confirmation dialog — see "Account deletion" below and `account-deletion.md` for the full model.

### Account deletion screen

Tapping **Delete account** in Settings opens a full-screen page. It is not a sheet and not a confirmation dialog — this isn't a quick action. The page is divided into three plain-language blocks, each with its own small heading:

1. **What's permanently removed.** Your email, your profile, every vote you've cast on any list. None of this can be recovered.
2. **What stays.** Items you've added on lists you share with other people, including their names and notes. Bob and Carol need that material to keep using their lists. Your name on those items changes to "Deleted user" with a gray avatar; the items themselves are unchanged.
3. **What's deleted with you.** Lists where you were the only remaining member, along with everything on them. Nothing of yours is left behind in someone else's space.

Below those blocks: a single text field labeled *"Type **delete** to confirm"* and a destructive **Delete my account** button in ember, disabled until the user types the magic word. Above the button, in muted text: *"This can't be undone."* No countdown timer, no checkboxes — the typed confirmation is the friction.

After tapping the destructive button: a brief loading state, then a confirmation screen ("Your account has been deleted") with a single button back to the sign-in screen. The session cookie is cleared (the server's `DELETE /auth/session` endpoint sets `Max-Age=0` on the `cairn_session` cookie); the app is fully logged out.

The "Deleted user" tombstone gets a specific visual treatment wherever an avatar would normally render: a flat gray disc, no initials, the display name "Deleted user" in muted italic. This appears on item attribution lines on the accordion, on members lists (rare — the tombstone is never an active member), and on the trash screen for any item the deleted user originally added.

For the data model behind all of this, see `account-deletion.md`.

## Invites & circles

The full feature is documented in `invites.md`; this section covers the UI surfaces it affects. Three new screens, plus changes to the lists screen and the long-press menu on members.

### Inbox row on the Lists screen

When the user has at least one pending invite, a single row appears at the top of the Lists screen, above the list of lists:

- One pending invite: *"Alice invited you to **Stuff to read**"* with two inline affordances — **Accept** (sage) and **Decline** (muted).
- More than one: *"3 pending invites"* with a chevron; tapping opens the full inbox screen.

The row uses a slightly tinted background (warm cream in light mode, slate-700 in dark) to distinguish it from list rows without competing for attention. It disappears entirely when the inbox is empty — invites are not a permanent UI element.

### Invites inbox screen

Reachable from Settings → Invites or by tapping the multi-invite row on the Lists screen. Plain list of pending invitations, sorted newest first. Each row:

- Inviter's display name and avatar.
- *"invited you to"* in muted text.
- The list name, in the same weight as a list-row title.
- An **Accept** button (sage) and a **Decline** button (muted), side by side.

Accept navigates immediately into the list (the user is now a full member). Decline removes the row with no animation drama and no "Are you sure?" — the row is replaced by the next pending invite, or by an empty-state message if it was the last (*"No pending invites"*, gentle, friendly).

There is no "report as spam" affordance and no "Bob invited you again" coalescing in v1 — the dedup is done server-side at insert time (one pending invite per list per recipient).

### Privacy screen

Reachable from Settings → Privacy. Three sections, top to bottom:

**1. Who can invite you to lists.** Three-way segmented control:
- **Everybody** (default — *"Anyone with a Cairn account"*)
- **Your circle** (*"Only people in your circle"*)
- **Nobody** (*"You can still create lists and invite others"*)

The subtitle below the segmented control changes based on the selected value, explaining the concrete consequence in plain language. Changing this setting auto-declines any pending invites that would now be blocked — a one-line note explains this when the value changes (*"3 pending invites have been declined to match your new setting"*).

**2. Your circle.** A row showing the count (*"7 people"*) with a chevron; tapping opens the **Circle** screen. The circle is the per-user allowlist that powers the *"Your circle"* invite policy. See below.

**3. Blocked.** A row showing the count (*"0 people"* if empty) with a chevron; tapping opens the **Blocked** screen. People here can never invite you, regardless of any other setting.

### Circle screen

Reachable from Settings → Privacy → Your circle. A single list of **People in your circle** — those you've added. Each row: avatar, display name, a small action affordance to remove (with confirmation: *"Stop accepting invites from Bob?"*).

The screen does *not* show "people who have you in their circle." Each user's circle is their own private permission setting on themselves — surfacing it to the people listed in it would turn a private setting into a quasi-social signal, which is the opposite of the intent. See `circles.md`.

At the top of the list, a small *"What is a circle?"* link opens a brief explainer sheet (one paragraph; same content as the top of `circles.md`). The link is always present — a circle is subtle enough that even returning users may want to re-check.

At the bottom, an **Add by email** field. Typing an email and confirming triggers the mutual email-add path (see `invites.md`). The success toast is generic — same on success, on "Bob doesn't exist," on "Bob blocked you" — to preserve Bob's privacy.

The screen is empty-state-friendly: a new user sees the brief explainer above the empty add-by-email field. No graphical empty state.

### Blocked screen

Reachable from Settings → Privacy → Blocked. A plain list of blocked users (avatar + display name) with an **Unblock** action on each row. Empty state: *"You haven't blocked anyone."* No add-by-email field here — blocking happens from a profile screen, not by typing an email.

### Profile screen (sheet)

Tapping any user's avatar or name (in a list members screen, the inbox, or anywhere else a user appears) opens a profile sheet. The sheet is modal, dismissed by tap-outside or a chevron-down handle.

Contents:
- Large avatar at top.
- Display name in the same weight as a screen title.
- (No email, no bio, no member-since, no list of shared lists. Privacy by minimalism — see `invites.md`.)
- A vertical stack of action rows, each tappable, showing only the actions valid given current state:

| Action | Shown when |
|---|---|
| **Add to circle** | Other user not in viewer's circle |
| **Remove from circle** | Other user is in viewer's circle |
| **Block** | Other user not blocked by viewer |
| **Unblock** | Other user is blocked by viewer |
| **Cancel pending invite** | Viewer has a pending invite to a shared list |

The profile screen never shows whether *the other person* has the viewer in their circle. That's their private setting on themselves; not the viewer's business. (See `circles.md`.)

Add to circle and Remove from circle are quiet — no confirmation, no animation drama. Block and Unblock prompt for confirmation (*"Block Bob? He won't be able to invite you to any list."*). Cancel pending invite is also quiet.

Tapping your **own** avatar bounces to Settings rather than opening a profile sheet. There is no "my profile" screen in v1.

### Invite picker (bottom sheet)

Opened from the **Members** screen of a list, by tapping the **Add member** affordance. A bottom sheet sliding up to roughly 75% of the screen height, with three sections, top to bottom:

1. **Your circle** — people in the viewer's circle, excluding existing members of the current list. Each row: avatar, display name, a tap-to-invite affordance. A single tap sends the invite; the row briefly shows a check or the generic *"Couldn't send"* error toast.
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

The user's *own* vote remains the primary signal on the row (the indicator on the trailing edge); the aggregate is a secondary read on the leading edge. The two never compete because they use different weights and different positions.

## Trash & undo

Soft delete is universal in Cairn (see `data-model.md`): items, lists, and list memberships are marked with `deleted_at`, never removed. The UI surfaces this in two places — a transient undo, and a per-list trash.

### Undo snackbar

Whenever a user soft-deletes an item, a snackbar appears at the bottom of the items screen for **6 seconds**: *"Deleted 'Bringing Up Baby' · Undo"*. Tapping Undo clears the `deleted_at` and the row pops back into place. After the snackbar dismisses, the item is in the trash, recoverable from there. The snackbar replaces — not stacks with — any previous one; the most recent delete wins.

While the snackbar is up, the FAB is hidden. The two share the bottom-right corner, and the Undo affordance must not be covered by the "add" button — undo *is* the action we want the user to take in those six seconds. The FAB returns when the snackbar dismisses.

The same pattern applies to deleting a list (snackbar on the lists screen) and to removing a member (snackbar on the members screen).

### Trash screen

Each list has a **Trash** entry in its overflow menu (the long-press / `⋮` sheet). Opening it shows the list's soft-deleted items, ordered most-recently-deleted first. Each row shows the item name, a faint *"deleted by Bob, 3 May 2026"* attribution, and a single **Restore** button. Tapping Restore clears `deleted_at` and returns the item to the live list at its original position in the sort.

There is no "empty trash" action. Hard deletion is not exposed in the UI; nothing in v1 ever calls `DELETE` on items. If we ever add a server-side garbage collection for very old deletions, that's a backend decision (see the open question in `architecture.md`), not a user-facing one.

A trashed list is reachable from a separate **Trash** entry in Settings (one trash per user, listing all deleted lists they were a member of). Restoring a list returns it to the lists screen with all its members and its trash intact.

The trash is not a feature we promise users — it's a safety net. The copy in delete confirmations should reflect that without making promises about retention windows: *"Bob and Carol will no longer see this item. You can restore it from this list's trash."* No "for 30 days," no countdown — just the affordance.

## Other surfaces

A few smaller patterns, pinned down so they stay consistent:

- **Aggregate score in the row.** Not shown in v1. The user's own vote is what's displayed; the group's score determines sort order but isn't surfaced as a number on each row. This keeps rows visually quiet. If we change our mind later, the view already exposes the data.
- **Empty list.** A list with no items shows a friendly empty illustration and an "Add the first item" call to action. No vote controls are rendered for non-existent items.
- **Empty lists screen.** A user with no lists yet sees a brief explainer and a "Create your first list" call to action.

## Button order in pairs

When two buttons sit side-by-side at the bottom of a sheet, dialog, or card, **right is the more committal action; left is the more backward / less committal one**. The right-side action is the one the screen exists to perform. The left-side action is the escape, the dismissal, or the more destructive option that takes the user *out* of the current context.

Concretely:

- `[Cancel] [Delete]` on a delete-confirmation sheet — the screen exists to delete; Delete is the forward action and goes right.
- `[Delete] [Edit]` on an item card — Edit advances into the editor (forward, more committal); Delete reverses the item's existence (more destructive, more backward, goes left).
- `[Decline] [Accept]` on an invite row — Accept advances into the list (forward); Decline dismisses (backward).

This applies to button pairs only. Single primary buttons (e.g. **Save** on the edit screen) are placed in the top-right of the top bar per platform convention.

## Not decided

These are deferred — they need a design pass but aren't blocking v1.

- **Editing and deleting lists.** The lists screen needs an affordance for renaming or deleting a list. Could be a long-press menu, a swipe gesture, or a per-list overflow button. Pending.
- **Exact typography for the indicator.** Whether `+++` should grow visually with magnitude (light → bold) within the fixed-width slot is a polish question for the implementation, not a v1 contract.
- **Haptics.** A small tick on each tap would be nice. Defer.
- **Animation.** A subtle slide for the accordion unfold and for vote-state transitions would be nice. Defer.
- **Accessibility labels.** Every control needs a screen-reader label ("Downvote *Casablanca*, currently rated +2 by you, tap to lower to +1"). The exact phrasing is for the implementation pass, but the requirement is fixed: every button is reachable and labeled.
