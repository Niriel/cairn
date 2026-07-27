import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Offline read: a list you have already opened still reads from the service
// worker's cache with the network cut, and a list you haven't opened says so
// plainly instead of showing stale rows or hanging.
//
// Runs against `vite preview` (playwright.pwa.config.ts) — the worker is inert
// under `pnpm dev`, so nothing would be cached.

const PASSWORD = 'cairn-e2e-pw';

// Cutting the network takes both halves. `setOffline` flips `navigator.onLine`
// and kills the *page's* requests, which is what the app's offline branches read
// — but Chromium's network emulation does not reach fetches issued from inside a
// service worker, so the SWR router would go on quietly reaching the server and
// every assertion below would pass against live data. Aborting the route cuts
// the worker's fetches too. Together they are what "offline" means here.
async function goOffline(page: Page): Promise<void> {
	await page.context().route('**/api/**', (route) => route.abort());
	await page.context().setOffline(true);
}

test.describe.serial('offline read', () => {
	let page: Page;
	let cachedListId: string;
	let coldListId: string;
	let cachedListName: string;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();

		const runId = Date.now().toString(36);
		cachedListName = `Cached list ${runId}`;
		await register(page, uniqueUsername('offlineuser'), PASSWORD);

		// Wait for the worker to control the page before anything worth caching
		// is fetched — an uncontrolled first load would bypass the router.
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
			timeout: 15_000
		});

		coldListId = await createList(page, `Cold list ${runId}`, 'Never opened before going offline');
		cachedListId = await createList(page, cachedListName, 'Opened before going offline');

		// Open the cached list last, so it — not the cold one — is the worker's
		// most-recently-viewed epoch, and add an item to have something to read.
		await page.locator(`[data-test="list-nav-${cachedListId}"]`).click();
		await expect(page).toHaveURL(new RegExp(`/lists/${cachedListId}$`));
		await page.locator('[data-test="items-fab"]').click();
		await page.locator('[data-test="add-edit-name"]').fill('Cached item');
		await page.locator('[data-test="add-edit-submit"]').click();
		await expect(page.locator('[data-test^="row-"]', { hasText: 'Cached item' })).toBeVisible();
	});

	test.afterAll(async () => {
		await page.context().setOffline(false);
		await page.context().unrouteAll();
		await page.close();
	});

	test('(a) an already-opened list still reads offline after a reload', async () => {
		await goOffline(page);
		await page.reload();

		// The rows come from the cached items_ranked response…
		await expect(page.locator('[data-test^="row-"]', { hasText: 'Cached item' })).toBeVisible();
		// …and the list's own name from its cached meta response. The name is the
		// canary for the cache purge that runs on entering a list: if the purge
		// took the incoming list's meta with it, the title would blank out.
		await expect(page.locator('[data-test="items-topbar"]')).toContainText(cachedListName);
	});

	test('(b) a list never opened before going offline says "No connection"', async () => {
		// Back to the lists overview, which reads from its own cached response.
		await page.locator('[data-test="topbar-back"]').click();
		await expect(page).toHaveURL(/\/lists$/);

		await page.locator(`[data-test="list-nav-${coldListId}"]`).click();
		await expect(page).toHaveURL(new RegExp(`/lists/${coldListId}$`));

		// Nothing cached for this list: an honest empty state, not stale rows and
		// not a spinner that never resolves.
		await expect(page.locator('[data-test="no-connection"]')).toBeVisible();
		await expect(page.locator('[data-test^="row-"]')).toHaveCount(0);
	});
});

/** Create a list from the Lists screen and return its id. */
async function createList(page: Page, name: string, description: string): Promise<string> {
	await page.locator('[data-test="lists-fab"]').click();
	await page.locator('[data-test="create-list-name"]').fill(name);
	await page.locator('[data-test="create-list-description"]').fill(description);
	await page.locator('[data-test="create-list-submit"]').click();

	const row = page.locator('[data-test^="list-nav-"]', { hasText: name }).first();
	await expect(row).toBeVisible();
	const attr = await row.getAttribute('data-test');
	return attr!.replace('list-nav-', '');
}
