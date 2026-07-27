import { expect, test, type Page } from '@playwright/test';

// The install path: the manifest is served as a manifest, the service worker
// takes control, and the app shell survives a reload with the network cut.
// Runs against `vite preview` (playwright.pwa.config.ts) — under `pnpm dev`
// the worker never registers, so none of this exists.
//
// Serial and single-page: the worker registers once per origin, and each test
// builds on the state the previous one left.

test.describe.serial('pwa install path', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
	});

	test.afterAll(async () => {
		await page.close();
	});

	test('(a) the manifest is served with the manifest MIME type', async () => {
		const response = await page.request.get('/manifest.webmanifest');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/manifest+json');
	});

	test('(b) the service worker takes control of the page', async () => {
		await page.goto('/');
		// `clients.claim()` on activate means the first load ends up controlled;
		// no reload needed.
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
			timeout: 15_000
		});
	});

	test('(c) the app shell still renders on an offline reload', async () => {
		// A signed-out visitor lands on the sign-in screen: proof the cached
		// shell booted and the router ran, with nothing fetched from the network.
		await expect(page.locator('[data-test="signin-username"]')).toBeVisible();

		await page.context().setOffline(true);
		await page.reload();

		await expect(page.locator('[data-test="signin-username"]')).toBeVisible();

		await page.context().setOffline(false);
	});
});
