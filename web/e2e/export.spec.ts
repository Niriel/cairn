import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Data-export happy path: a throwaway user signs in, walks Settings → Download
// my data, prepares the archive, and downloads a real ZIP. A separate check
// confirms the delete-account courtesy nudge links to the same hub. The user
// is unique per run so nothing here disturbs other specs.

test.describe.serial('data export flow', () => {
	let page: Page;
	let email: string;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();

		const runId = Date.now().toString(36);
		email = `alice+export-${runId}@example.test`;

		await page.goto('/');
		await expect(page).toHaveURL(/\/auth\/login$/);
		await page.locator('[data-test="login-email"]').fill(email);
		await page.locator('[data-test="login-submit"]').click();
		await expect(page).toHaveURL(/\/auth\/check$/);
		const { link } = await waitForMagicLink(email);
		await page.goto(link);
		await expect(page).toHaveURL(/\/lists$/);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test('(a) Settings → Download my data opens the export hub', async () => {
		await page.goto('/settings');
		await page.locator('[data-test="settings-download-data"]').click();
		await expect(page).toHaveURL(/\/settings\/data-export$/);
	});

	test('(b) preparing the download reaches the ready state', async () => {
		await page.locator('[data-test="export-prepare"]').click();
		// The filename chip only renders once the archive is built (ready state).
		await expect(page.locator('[data-test="export-filename"]')).toBeVisible();
		await expect(page.locator('[data-test="export-filename"]')).toContainText(
			/cairn-export-\d{8}-[a-z0-9]+\.zip/
		);
	});

	test('(c) downloading saves a non-empty ZIP', async () => {
		const downloadPromise = page.waitForEvent('download');
		await page.locator('[data-test="export-download"]').click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/^cairn-export-\d{8}-[a-z0-9]+\.zip$/);

		const path = await download.path();
		const bytes = await readFile(path);
		// ZIP local-file-header magic: "PK\x03\x04".
		expect(bytes.length).toBeGreaterThan(4);
		expect(bytes[0]).toBe(0x50); // P
		expect(bytes[1]).toBe(0x4b); // K
	});

	test('(d) the delete-account nudge links back to the export hub', async () => {
		await page.goto('/settings/delete-account');
		await page.locator('[data-test="delete-account-export-download"]').click();
		await expect(page).toHaveURL(/\/settings\/data-export$/);
	});
});
