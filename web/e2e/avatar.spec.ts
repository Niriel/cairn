import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

const FIXTURE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'fixtures/test-avatar.jpg'
);

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('avatar flow', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		if (process.env.SKIP_E2E) {
			return;
		}

		page = await browser.newPage();
		await register(page, uniqueUsername('avataruser'), PASSWORD);
	});

	test.afterAll(async () => {
		if (page) await page.close();
	});

	// (a) Profile chip in Settings navigates to /profile.
	test('(a) profile chip navigates to /profile', async () => {
		test.skip(!!process.env.SKIP_E2E, 'SKIP_E2E set — dev stack not available');

		await page.goto('/settings');
		await page.locator('[data-test="profile-chip"]').click();
		await expect(page).toHaveURL(/\/profile$/);
	});

	// (b) Upload avatar: pick file → crop → assert Saved state + img src updated.
	test('(b) upload avatar shows Saved state and updates img src', async () => {
		test.skip(!!process.env.SKIP_E2E, 'SKIP_E2E set — dev stack not available');

		await page.goto('/profile');

		// Open the source sheet.
		await page.locator('[data-test="change-picture"]').click();

		// Source sheet is visible — inject the file directly on the library input
		// (the one without a capture attribute) to bypass the OS file picker.
		const libraryInput = page.locator('input[type="file"]:not([capture])');
		await libraryInput.setInputFiles(FIXTURE);

		// AvatarCropScreen renders — click Save.
		await expect(page.locator('[data-test="crop-save"]')).toBeVisible();
		await page.locator('[data-test="crop-save"]').click();

		// Uploading → Saved transition.
		await expect(page.locator('[data-test="upload-state"]')).toBeVisible();
		await expect(page.locator('[data-test="upload-state"]')).toContainText('Saved');

		// Click Done to return to edit view.
		await page.locator('button', { hasText: 'Done' }).click();

		// Avatar is now an <img> element with a versioned src.
		const avatarImg = page.locator('img[data-test="profile-avatar"]');
		await expect(avatarImg).toBeVisible();
		const src = await avatarImg.getAttribute('src');
		expect(src).toMatch(/\.webp\?v=\d+/);
	});

	// (c) Remove avatar reverts to initials disc.
	test('(c) remove avatar reverts to initials disc', async () => {
		test.skip(!!process.env.SKIP_E2E, 'SKIP_E2E set — dev stack not available');

		await page.goto('/profile');

		// Remove button is present (avatar_version > 0 after upload).
		await expect(page.locator('[data-test="remove-avatar"]')).toBeVisible();
		await page.locator('[data-test="remove-avatar"]').click();

		// Avatar reverts to initials (no <img>).
		await expect(page.locator('img[data-test="profile-avatar"]')).not.toBeVisible();
		await expect(page.locator('[data-test="remove-avatar"]')).not.toBeVisible();
	});

	// (d) Display name: update and confirm it appears on the Settings chip.
	test('(d) updating display name reflects on Settings profile chip', async () => {
		test.skip(!!process.env.SKIP_E2E, 'SKIP_E2E set — dev stack not available');

		await page.goto('/profile');

		const input = page.locator('[data-test="display-name-input"]');
		await input.clear();
		await input.fill('Alice Updated');
		await page.locator('[data-test="save-profile"]').click();

		// Save navigates back to Settings.
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.locator('[data-test="profile-chip"]')).toContainText('Alice Updated');
	});
});
