import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Public-list flow: a member publishes a list and copies its link, then a
// signed-out visitor opens /p/<id> and sees a read-only view — while a
// still-private list's id at /p/ reports "not available".
//
// Serial: each step builds on the published/private lists created in beforeAll.

test.describe.serial('public list flow', () => {
	let page: Page;
	let publicListId: string;
	let privateListId: string;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();

		// Login via magic-link with a unique email for this describe block.
		const runId = Date.now().toString(36);
		const email = `alice+public-${runId}@example.test`;

		await page.goto('/');
		await expect(page).toHaveURL(/\/auth\/login$/);
		await page.locator('[data-test="login-email"]').fill(email);
		await page.locator('[data-test="login-submit"]').click();
		await expect(page).toHaveURL(/\/auth\/check$/);
		const { link } = await waitForMagicLink(email);
		await page.goto(link);
		await expect(page).toHaveURL(/\/lists$/);

		// Create the list we'll publish, with one item.
		await page.locator('[data-test="lists-fab"]').click();
		await page.locator('[data-test="create-list-name"]').fill(`Public test ${runId}`);
		await page.locator('[data-test="create-list-submit"]').click();
		await page.locator('[data-test^="list-nav-"]').first().click();
		await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);
		publicListId = page.url().split('/lists/')[1];

		await page.locator('[data-test="items-fab"]').click();
		await page.locator('[data-test="add-edit-name"]').fill('A public pick');
		await page.locator('[data-test="add-edit-submit"]').click();
		await expect(page.locator('[data-test="add-edit-name"]')).not.toBeVisible();

		// Create a second list and leave it private.
		await page.locator('[data-test="topbar-back"]').click();
		await expect(page).toHaveURL(/\/lists$/);
		await page.locator('[data-test="lists-fab"]').click();
		await page.locator('[data-test="create-list-name"]').fill(`Private test ${runId}`);
		await page.locator('[data-test="create-list-submit"]').click();
		await page.locator('[data-test^="list-nav-"]').first().click();
		await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);
		privateListId = page.url().split('/lists/')[1];

		// Back on the public list for the publish step.
		await page.goto(`/lists/${publicListId}`);
	});

	test.afterAll(async () => {
		await page.close();
	});

	// (a) Publishing reveals the public marker and the copy-link affordance.
	test('(a) a member can publish the list', async () => {
		await page.getByRole('button', { name: 'More options' }).click();
		await page.locator('[data-test="list-overflow-toggle-public"]').click();

		// The toggle now offers "Make private", and a copy-link row appears.
		await expect(page.locator('[data-test="list-overflow-toggle-public"]')).toContainText(
			'Make private'
		);
		await expect(page.locator('[data-test="list-overflow-copy-link"]')).toBeVisible();
	});

	// (b) Copying the link gives visible "Copied" feedback.
	test('(b) copy public link surfaces "Copied" feedback', async () => {
		await page.locator('[data-test="list-overflow-copy-link"]').click();
		await expect(page.locator('[data-test="list-overflow-copy-link"]')).toContainText('Copied');
	});

	// (c) A signed-out visitor opens /p/<id> and sees the read-only list with
	// no edit affordances.
	test('(c) signed-out visitor sees the read-only public view', async ({ browser }) => {
		const anon = await browser.newContext();
		const anonPage = await anon.newPage();
		try {
			await anonPage.goto(`/p/${publicListId}`);
			await expect(anonPage.locator('[data-test="public-list"]')).toBeVisible();
			await expect(anonPage.locator('[data-test="public-list"]')).toContainText('A public pick');

			// Read-only: no add-item FAB, no vote controls, and the home link invites
			// joining (it points at the app root).
			await expect(anonPage.locator('[data-test="items-fab"]')).toHaveCount(0);
			await expect(anonPage.locator('[data-test="vote-up"]')).toHaveCount(0);
			await expect(anonPage.locator('[data-test="public-home-link"]')).toHaveAttribute('href', '/');
		} finally {
			await anon.close();
		}
	});

	// (d) A still-private list's id reports "not available" — private and
	// missing are indistinguishable to a signed-out visitor.
	test('(d) a private list id shows "not available"', async ({ browser }) => {
		const anon = await browser.newContext();
		const anonPage = await anon.newPage();
		try {
			await anonPage.goto(`/p/${privateListId}`);
			await expect(anonPage.locator('[data-test="public-unavailable"]')).toBeVisible();
			await expect(anonPage.locator('[data-test="public-list"]')).toHaveCount(0);
		} finally {
			await anon.close();
		}
	});
});
