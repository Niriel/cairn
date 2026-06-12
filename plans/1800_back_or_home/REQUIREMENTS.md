# Requirements: TopBar back-or-home button

The TopBar Back button currently calls `history.back()` unconditionally, so
opening Cairn directly onto a deep route (a reopened tab, a pasted or
bookmarked `/lists/<uuid>`) leaves the user stranded — there is no in-app
history to go back to, so the button either does nothing or walks out of the
app. This work makes the button aware of whether the app has navigated since
cold load, and turns it into a **Home** affordance when it hasn't. Tracks
TODO #8.

## R1. The TopBar back control falls back to Home when there is no in-app history

The default TopBar back control behaves in two modes, selected by whether the
app has performed at least one client-side navigation since the document was
loaded ("in-app history"):

- **In-app history present** — the control is a Back button: it shows the
  `chevron-left` icon and activating it calls `history.back()`. This is the
  unchanged common case.
- **No in-app history** (cold load straight onto the current route) — the
  control is a Home button: it shows the `home` icon and activating it
  navigates to the home route `/lists` via SvelteKit's `goto`, rather than
  calling `history.back()`.

The mode is recomputed reactively; once the user has navigated within the app
the control is permanently a Back button for the remainder of that document's
lifetime (going back is then always safe).

## R2. In-app history is detected by an "in-app referrer", not by `history.length`

The signal driving R1 is whether a client-side navigation with a previous
in-app page has occurred — equivalently, whether SvelteKit's `afterNavigate`
has fired with a non-null `from`. `history.length` must not be used: it counts
unrelated entries from earlier in the same browser tab, so it cannot
distinguish "came here from inside Cairn" from "opened Cairn over the top of
another site". The detection state is owned by a single shared module and is
seeded from the always-mounted root layout.

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
imprint, the bin/trash screen, items screen, and every `AppTopBar` consumer).
Screens that pass a custom `left` snippet, or set `showBack={false}` (e.g. the
lists/home screen itself), are unaffected.

## Non-requirements (explicitly excluded)

- **Distinguishing "do nothing" from "leave the app" in back mode** — once
  in-app history exists we trust `history.back()`; we do not attempt to detect
  whether a specific back step would exit the app.
- **A configurable home destination** — the home route is fixed to `/lists`
  (matching the existing `+page.svelte` redirect); callers cannot override it.
- **Migrating the other inline `.icon-btn` buttons** — TODO #7's broader
  `IconButton`/`MoreButton` migration is separate; this work only retires the
  one inline back button it replaces.
- **Restoring scroll position or deep back-stack reconstruction** — the home
  fallback is a single hop to `/lists`, not a rebuilt history stack.
