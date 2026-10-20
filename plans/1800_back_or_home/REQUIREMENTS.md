# Requirements: TopBar back-or-home button

The TopBar Back button currently calls `history.back()` unconditionally, so
opening Cairn directly onto a deep route (a reopened tab, a pasted or
bookmarked `/lists/<uuid>`) leaves the user stranded — there is no in-app
history to go back to, so the button either does nothing or walks out of the
app. This work makes the button aware of whether the page behind the current
one is a Cairn page, and turns it into a **Home** affordance when it isn't.
Tracks TODO #8.

## R1. The TopBar back control falls back to Home when back would leave Cairn

The default TopBar back control behaves in two modes, selected by whether the
entry directly behind the current one in this tab's history is a Cairn page:

- **A Cairn page is behind us** — the control is a Back button: it shows the
  `chevron-left` icon and activating it calls `history.back()`. This is the
  unchanged common case.
- **Nothing in Cairn is behind us** (a cold load straight onto the current
  route, or having pressed back down to that first page) — the control is a
  Home button: it shows the `home` icon and activating it navigates to the home
  route `/lists` via SvelteKit's `goto`, rather than calling `history.back()`.

The mode is re-evaluated after every history change (push, replace, back,
forward, reload), so pressing back repeatedly never walks out of the app.

## R2. The signal is the browser's `navigation.canGoBack`

R1's signal is the Navigation API's `navigation.canGoBack`, which is true only
when the previous session-history entry is same-origin. The app does not
reconstruct it from its own navigation events. `history.length` must not be
used: it counts unrelated entries from earlier in the same browser tab, so it
cannot distinguish "came here from inside Cairn" from "opened Cairn over the
top of another site". A browser without the Navigation API is treated as
"nothing behind us", so it always shows Home: never stranding, just less
convenient. The signal is owned by a single shared state module.

## R3. The affordance matches its destination

The icon and accessible label change with the mode so the affordance matches
where it goes: `chevron-left` + accessible label "Back" in the back mode,
`home` + accessible label "Home" in the home mode. Labels are user-facing and
follow British English conventions (here both spellings coincide). The control
keeps a stable test selector (`data-test="topbar-back"`) across both modes so
existing tests and e2e touches address it the same way.

## R4. Applies everywhere TopBar shows its default back control

The behaviour lives in the TopBar's default back control, so it applies to
every screen that renders TopBar without overriding the `left` slot (e.g.
the About pages, the bin/trash screen, items screen, and every `AppTopBar` consumer).
Screens that pass a custom `left` snippet, or set `showBack={false}` (e.g. the
lists/home screen itself), are unaffected.

## Non-requirements (explicitly excluded)

- **Changing system back** — the browser or phone back gesture keeps its
  native behaviour: on a cold-loaded page it leaves Cairn, as it does for any
  site. Only the in-app control changes; no history entries are inserted.
- **A configurable home destination** — the home route is fixed to `/lists`
  (matching the existing `+page.svelte` redirect); callers cannot override it.
- **Migrating the other inline `.icon-btn` buttons** — TODO #7's broader
  `IconButton`/`MoreButton` migration is separate; this work only retires the
  one inline back button it replaces.
- **Restoring scroll position or deep back-stack reconstruction** — the home
  fallback is a single hop to `/lists`, not a rebuilt history stack.
