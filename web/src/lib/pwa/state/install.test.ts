import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Fresh module per case: the store reads matchMedia/navigator/localStorage and
// wires window listeners at import time, so re-import after stubbing.
async function freshInstall() {
	vi.resetModules();
	return (await import('./install.svelte')).install;
}

const HINT_KEY = 'cairn.install_hint_dismissed';

function stubMatchMedia(standalone: boolean) {
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		writable: true,
		value: (query: string) => ({ matches: standalone && query.includes('standalone') })
	});
}

function stubUserAgent(ua: string) {
	Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => ua });
}

const CHROME_UA =
	'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPHONE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** A stand-in for the browser's non-standard `beforeinstallprompt` event. */
function beforeInstallPromptEvent() {
	const event = new Event('beforeinstallprompt', { cancelable: true });
	return Object.assign(event, { prompt: vi.fn(async () => {}) });
}

beforeEach(() => {
	localStorage.clear();
	stubMatchMedia(false);
	stubUserAgent(CHROME_UA);
});

afterEach(() => {
	localStorage.clear();
});

describe('install store', () => {
	test('canPrompt starts false and a beforeinstallprompt event sets it', async () => {
		const install = await freshInstall();
		expect(install.canPrompt).toBe(false);

		window.dispatchEvent(beforeInstallPromptEvent());
		expect(install.canPrompt).toBe(true);
	});

	test('the captured beforeinstallprompt event is suppressed', async () => {
		await freshInstall();

		const event = beforeInstallPromptEvent();
		window.dispatchEvent(event);
		// preventDefault() stops Chrome's own mini-infobar so the hint can own
		// the affordance.
		expect(event.defaultPrevented).toBe(true);
	});

	test('promptInstall calls the captured event prompt and consumes it', async () => {
		const install = await freshInstall();

		const event = beforeInstallPromptEvent();
		window.dispatchEvent(event);

		await install.promptInstall();
		expect(event.prompt).toHaveBeenCalledTimes(1);
		// The event is single-use; a second call must not re-prompt.
		expect(install.canPrompt).toBe(false);
		await install.promptInstall();
		expect(event.prompt).toHaveBeenCalledTimes(1);
	});

	test('promptInstall is a no-op with nothing captured', async () => {
		const install = await freshInstall();
		await expect(install.promptInstall()).resolves.toBeUndefined();
	});

	test('appinstalled clears canPrompt', async () => {
		const install = await freshInstall();

		window.dispatchEvent(beforeInstallPromptEvent());
		expect(install.canPrompt).toBe(true);

		window.dispatchEvent(new Event('appinstalled'));
		expect(install.canPrompt).toBe(false);
	});

	test('isStandalone reflects the display-mode media query', async () => {
		stubMatchMedia(true);
		const install = await freshInstall();
		expect(install.isStandalone).toBe(true);
	});

	test('isStandalone is false in a normal browser tab', async () => {
		stubMatchMedia(false);
		const install = await freshInstall();
		expect(install.isStandalone).toBe(false);
	});

	test('isStandalone reflects the iOS navigator.standalone flag', async () => {
		stubMatchMedia(false);
		Object.defineProperty(window.navigator, 'standalone', {
			configurable: true,
			get: () => true
		});
		const install = await freshInstall();
		expect(install.isStandalone).toBe(true);
		Reflect.deleteProperty(window.navigator, 'standalone');
	});

	test('isIos is true on an iPhone user agent and false elsewhere', async () => {
		stubUserAgent(IPHONE_UA);
		expect((await freshInstall()).isIos).toBe(true);

		stubUserAgent(CHROME_UA);
		expect((await freshInstall()).isIos).toBe(false);
	});

	test('hintDismissed starts false and dismissHint sets and persists it', async () => {
		const install = await freshInstall();
		expect(install.hintDismissed).toBe(false);

		install.dismissHint();
		expect(install.hintDismissed).toBe(true);
		expect(localStorage.getItem(HINT_KEY)).toBe('1');
	});

	test('hintDismissed is restored from localStorage', async () => {
		localStorage.setItem(HINT_KEY, '1');
		const install = await freshInstall();
		expect(install.hintDismissed).toBe(true);
	});
});
