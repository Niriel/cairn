// Shared state behind the install affordance: whether the browser has offered
// us an install prompt to fire, whether we are already running installed, and
// whether the user has waved the first-launch hint away.
//
// Chrome-family browsers fire the non-standard `beforeinstallprompt` before
// showing their own mini-infobar; we cancel it and hold the event so the hint
// and the Settings row can prompt at a moment of the user's choosing. Safari
// fires nothing at all — hence `isIos`, which routes those users to the
// manual "Add to Home Screen" explainer instead.
//
// SSR/test-guarded: Cairn is an SPA, but Vitest runs modules in happy-dom and
// the store is imported eagerly, so guard `window`/`navigator`/`localStorage`.

const HINT_DISMISSED_KEY = 'cairn.install_hint_dismissed';

/** The non-standard event Chrome-family browsers fire before offering install. */
interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
}

// Held outside `$state`: the event itself is never read reactively, only
// `canPrompt` is.
let deferred: BeforeInstallPromptEvent | null = null;

let canPrompt = $state(false);
let hintDismissed = $state(readHintDismissed());

function readHintDismissed(): boolean {
	try {
		return localStorage.getItem(HINT_DISMISSED_KEY) === '1';
	} catch {
		// Private-mode Safari and SSR both throw here; treat as not dismissed.
		return false;
	}
}

if (typeof window !== 'undefined') {
	window.addEventListener('beforeinstallprompt', (event) => {
		// Suppress the browser's own infobar so the hint owns the affordance.
		event.preventDefault();
		deferred = event as BeforeInstallPromptEvent;
		canPrompt = true;
	});

	window.addEventListener('appinstalled', () => {
		deferred = null;
		canPrompt = false;
	});
}

export const install = {
	get canPrompt(): boolean {
		return canPrompt;
	},

	/**
	 * True when Cairn is running as an installed app — either the standard
	 * display-mode query or Safari's non-standard `navigator.standalone`.
	 * Read live rather than cached: the value is cheap and a tab can, in
	 * principle, be launched into standalone after this module loads.
	 */
	get isStandalone(): boolean {
		if (typeof window === 'undefined') return false;
		if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
		return (navigator as Navigator & { standalone?: boolean }).standalone === true;
	},

	/**
	 * True on iOS/iPadOS, where no browser exposes `beforeinstallprompt` and
	 * installation is a manual share-sheet gesture. Every iOS browser is
	 * WebKit underneath, so the platform — not the browser brand — is what we
	 * sniff. iPadOS reports a Macintosh UA in desktop mode, distinguished by
	 * having a touchscreen.
	 */
	get isIos(): boolean {
		if (typeof navigator === 'undefined') return false;
		const ua = navigator.userAgent;
		if (/iPhone|iPad|iPod/.test(ua)) return true;
		return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
	},

	get hintDismissed(): boolean {
		return hintDismissed;
	},

	/**
	 * Fire the captured install prompt. A `beforeinstallprompt` event is
	 * single-use, so it is consumed here; the browser will fire a fresh one if
	 * the user declines and remains eligible.
	 */
	promptInstall: async (): Promise<void> => {
		const event = deferred;
		if (!event) return;
		deferred = null;
		canPrompt = false;
		await event.prompt();
	},

	dismissHint: (): void => {
		hintDismissed = true;
		try {
			localStorage.setItem(HINT_DISMISSED_KEY, '1');
		} catch {
			// Storage unavailable — the dismissal holds for this session only.
		}
	}
};
