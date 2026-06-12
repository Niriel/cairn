import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Welcome-banner touch: a freshly-signed-up user keeps the default name
// ('New user') until they personalise their profile. On the lists screen
// they should see a welcome banner whose button takes them to /profile.

test.describe.serial('welcome banner', () => {
	let page: Page;
	let email: string;

	test.beforeAll(async ({ browser }) => {
		const runId = Date.now().toString(36);
		email = `newbie+welcome-${runId}@example.test`;

		page = await browser.newPage();
		await page.goto('/');
		await expect(page).toHaveURL(/\/auth\/login$/);
		await page.locator('[data-test="login-email"]').fill(email);
		await page.locator('[data-test="login-submit"]').click();
		const link = (await waitForMagicLink(email)).link;
		await page.goto(link);
		await expect(page).toHaveURL(/\/lists$/);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test('(a) a new user sees the welcome banner and the edit button opens their profile', async () => {
		const banner = page.locator('[data-test="welcome-banner"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText('Welcome to Cairn');

		await page.locator('[data-test="welcome-banner-edit"]').click();
		await expect(page).toHaveURL(/\/profile$/);
	});
});
