// Tracks whether the app has performed at least one client-side
// navigation since the document was loaded — an "in-app referrer".
// The default TopBar back control reads this to decide whether
// `history.back()` is safe (there's an in-app page behind us) or
// whether it should fall back to navigating home instead.
//
// `history.length` cannot answer this: it counts unrelated entries
// from earlier in the same browser tab, so a bookmarked deep URL
// opened over the top of another site reports length > 1 even though
// going back walks out of Cairn. Instead the root layout feeds this
// flag from SvelteKit's `afterNavigate` (whose `from` is null only on
// the initial `enter`). Once true it stays true — going back is then
// always safe.

let hasInApp = $state(false);

// Boxed behind a getter so consumers read `navHistory.hasInApp`
// reactively without being able to flip it directly — the only writer
// is `recordInAppNavigation`, called from the layout.
export const navHistory = {
	get hasInApp() {
		return hasInApp;
	}
};

/** Record that an in-app client-side navigation occurred. Idempotent. */
export function recordInAppNavigation(): void {
	hasInApp = true;
}

/** Reset module state between tests. Not for production use. */
export function _resetForTesting(): void {
	hasInApp = false;
}
