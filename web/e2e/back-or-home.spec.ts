import { expect, test, type BrowserContext } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Back-or-home: the top-bar arrow is a Back button only while a Cairn page is
// behind the current one in this tab; otherwise it is a Home button to /lists.
// A new page in the signed-in context is a fresh tab with an empty history —
// exactly what opening a bookmark does.

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('back or home', () => {
	let context: BrowserContext;
	let listId: string;

	test.beforeAll(async ({ browser }) => {
		context = await browser.newContext();
		const page = await context.newPage();
		await register(page, uniqueUsername('backhome'), PASSWORD);

		await page.locator('[data-test="lists-fab"]').click();
		await expect(page.locator('[data-test="create-list-name"]')).toBeFocused();
		await page.keyboard.type(`Back or home ${Date.now().toString(36)}`);
		await page.locator('[data-test="create-list-submit"]').click();

		const listRow = page.locator('[data-test^="list-nav-"]').first();
		const navAttr = await listRow.getAttribute('data-test');
		listId = navAttr!.replace('list-nav-', '');
		await page.close();
	});

	test.afterAll(async () => {
		// Unset when beforeAll failed (e.g. no browser installed); don't mask that.
		await context?.close();
	});

	test('a bookmarked list opened in a new tab offers Home', async () => {
		const tab = await context.newPage();
		await tab.goto(`/lists/${listId}`);

		const control = tab.locator('[data-test="topbar-back"]');
		await expect(control).toHaveAttribute('aria-label', 'Home');
		await control.click();
		await expect(tab).toHaveURL(/\/lists$/);
		await tab.close();
	});

	test('backing down to the first page turns Back into Home again', async () => {
		const tab = await context.newPage();
		await tab.goto('/settings');

		const control = tab.locator('[data-test="topbar-back"]');
		await expect(control).toHaveAttribute('aria-label', 'Home');

		await tab.locator('[data-test="settings-privacy"]').click();
		await expect(tab).toHaveURL(/\/settings\/privacy$/);
		await expect(control).toHaveAttribute('aria-label', 'Back');

		await control.click();
		await expect(tab).toHaveURL(/\/settings$/);
		await expect(control).toHaveAttribute('aria-label', 'Home');

		await control.click();
		await expect(tab).toHaveURL(/\/lists$/);
		await tab.close();
	});
});
