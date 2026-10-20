import { afterEach, describe, expect, test, vi } from 'vitest';

// The module reads the Navigation API at import, so each test installs its own
// fake `navigation` and re-imports the module fresh.
class FakeNavigation extends EventTarget {
	canGoBack = false;
}

async function load() {
	vi.resetModules();
	return (await import('./nav-history.svelte')).navHistory;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('nav-history', () => {
	test('(a) mirrors the initial navigation.canGoBack', async () => {
		const nav = new FakeNavigation();
		nav.canGoBack = true;
		vi.stubGlobal('navigation', nav);

		expect((await load()).canGoBack).toBe(true);
	});

	test('(b) follows currententrychange', async () => {
		const nav = new FakeNavigation();
		vi.stubGlobal('navigation', nav);
		const navHistory = await load();
		expect(navHistory.canGoBack).toBe(false);

		nav.canGoBack = true;
		nav.dispatchEvent(new Event('currententrychange'));
		expect(navHistory.canGoBack).toBe(true);

		nav.canGoBack = false;
		nav.dispatchEvent(new Event('currententrychange'));
		expect(navHistory.canGoBack).toBe(false);
	});

	test('(c) reports false without the Navigation API', async () => {
		vi.stubGlobal('navigation', undefined);

		expect((await load()).canGoBack).toBe(false);
	});
});
