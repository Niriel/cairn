import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Account-deletion happy path: a throwaway user signs in, walks Settings →
// Delete account, types the `delete` confirmation, presses the destructive
// button, sees the confirmation view, and "Back to sign in" lands them on the
// login screen. The user is unique per run so the deletion can't disturb other
// specs.

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('delete account flow', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await register(page, uniqueUsername('deluser'), PASSWORD);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test('(a) Settings → Delete account opens the delete screen', async () => {
		await page.goto('/settings');
		await page.locator('[data-test="delete-account"]').click();
		await expect(page).toHaveURL(/\/settings\/delete-account$/);
		await expect(page.locator('[data-test="delete-account-screen"]')).toBeVisible();
	});

	test('(b) the confirm button is gated behind typing "delete"', async () => {
		const confirm = page.locator('[data-test="delete-account-confirm"]');
		await expect(confirm).toBeDisabled();
		await page.locator('[data-test="delete-account-input"]').fill('delete');
		await expect(confirm).toBeEnabled();
	});

	test('(c) confirming deletes the account and shows the confirmation view', async () => {
		await page.locator('[data-test="delete-account-confirm"]').click();
		await expect(page.locator('[data-test="delete-account-done"]')).toBeVisible();
	});

	test('(d) "Back to sign in" returns to the sign-in screen', async () => {
		await page.locator('[data-test="delete-account-signout"]').click();
		await expect(page).toHaveURL(/\/auth\/signin$/);
	});
});
