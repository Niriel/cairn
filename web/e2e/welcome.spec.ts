import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Welcome-banner touch: a freshly-signed-up user keeps the default name
// ('New user') until they personalise their profile. On the lists screen
// they should see a welcome banner whose button takes them to /profile.

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('welcome banner', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await register(page, uniqueUsername('welcomeuser'), PASSWORD);
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
