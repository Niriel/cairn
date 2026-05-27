import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Items flow: serial because each step builds on the previous one.
// Login → create list → add items → exercise accordion, voting, edit, delete/undo.

test.describe.serial('items flow', () => {
	let page: Page;
	let listId: string;
	let alphaId: string;
	let betaId: string;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();

		// Login via magic-link using a unique email for this describe block.
		const runId = Date.now().toString(36);
		const email = `alice+items-${runId}@example.test`;

		await page.goto('/');
		await expect(page).toHaveURL(/\/auth\/login$/);
		await page.locator('[data-test="login-email"]').fill(email);
		await page.locator('[data-test="login-submit"]').click();
		await expect(page).toHaveURL(/\/auth\/check$/);
		const { link } = await waitForMagicLink(email);
		await page.goto(link);
		await expect(page).toHaveURL(/\/lists$/);

		// Create a list.
		await page.locator('[data-test="lists-fab"]').click();
		await page.locator('[data-test="create-list-name"]').fill(`Items test ${runId}`);
		await page.locator('[data-test="create-list-submit"]').click();

		// The new list appears — navigate into it.
		const listRow = page.locator('[data-test^="list-nav-"]').first();
		const navAttr = await listRow.getAttribute('data-test');
		listId = navAttr!.replace('list-nav-', '');
		await listRow.click();
		await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));

		// Add "Alpha".
		await page.locator('[data-test="items-fab"]').click();
		await page.locator('[data-test="add-edit-name"]').fill('Alpha');
		await page.locator('[data-test="add-edit-submit"]').click();
		await expect(page.locator('[data-test="add-edit-name"]')).not.toBeVisible();

		// Add "Beta".
		await page.locator('[data-test="items-fab"]').click();
		await page.locator('[data-test="add-edit-name"]').fill('Beta');
		await page.locator('[data-test="add-edit-submit"]').click();
		await expect(page.locator('[data-test="add-edit-name"]')).not.toBeVisible();

		// Vote +1 on Beta so it has a higher score than Alpha (score-sort test).
		const betaRow = page.locator('.row', { hasText: 'Beta' }).first();
		await betaRow.locator('[data-test="vote-up"]').click();
		await expect(betaRow.locator('[data-test="vote-indicator"]')).toHaveText('+');

		// Capture item IDs from data-test attributes.
		const alphaRowTap = page.locator('[data-test^="row-"]', { hasText: 'Alpha' }).first();
		const alphaAttr = await alphaRowTap.getAttribute('data-test');
		alphaId = alphaAttr!.replace('row-', '');

		const betaRowTap = page.locator('[data-test^="row-"]', { hasText: 'Beta' }).first();
		const betaAttr = await betaRowTap.getAttribute('data-test');
		betaId = betaAttr!.replace('row-', '');

		// Navigate back to /lists so test (a) starts from there.
		await page.locator('[data-test="topbar-back"]').click();
		await expect(page).toHaveURL(/\/lists$/);
	});

	test.afterAll(async () => {
		await page.close();
	});

	// (a) Navigate from lists → items; items rendered in score-sorted order.
	test('(a) navigating into a list shows items score-sorted', async () => {
		await page.locator(`[data-test="list-nav-${listId}"]`).click();
		await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));

		// Beta (score +1) should appear before Alpha (score 0).
		const rows = page.locator('[data-test^="row-"]');
		await expect(rows.first()).toContainText('Beta');
		await expect(rows.nth(1)).toContainText('Alpha');
	});

	// (b) Tapping a row opens its panel; tapping again closes it.
	test('(b) accordion opens on tap, closes on second tap', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-panel"]')).toBeVisible();

		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-panel"]')).not.toBeVisible();
	});

	// (c) Opening a second row closes the first.
	test('(c) opening second row closes first', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-panel"]')).toBeVisible();

		await page.locator(`[data-test="row-${betaId}"]`).click();
		// Only one panel should be visible (Beta's).
		await expect(page.locator('[data-test="item-panel"]')).toHaveCount(1);
		await expect(page.locator(`[data-test="panel-edit-${betaId}"]`)).toBeVisible();
		await expect(page.locator(`[data-test="panel-edit-${alphaId}"]`)).not.toBeVisible();

		// Close.
		await page.locator(`[data-test="row-${betaId}"]`).click();
	});

	// (d) Voting up on an item updates the indicator.
	test('(d) voting up updates the vote indicator', async () => {
		const alphaVoteUp = page
			.locator(`.row:has([data-test="row-${alphaId}"])`)
			.locator('[data-test="vote-up"]');
		const alphaIndicator = page
			.locator(`.row:has([data-test="row-${alphaId}"])`)
			.locator('[data-test="vote-indicator"]');

		await expect(alphaIndicator).toHaveText('=');
		await alphaVoteUp.click();
		await expect(alphaIndicator).toHaveText('+');
	});

	// (e) Edit sheet opens with pre-populated fields; saving updates the name.
	test('(e) editing an item updates its name', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator(`[data-test="panel-edit-${alphaId}"]`)).toBeVisible();
		await page.locator(`[data-test="panel-edit-${alphaId}"]`).click();

		// Edit sheet pre-populates the name.
		await expect(page.locator('[data-test="add-edit-name"]')).toHaveValue('Alpha');

		await page.locator('[data-test="add-edit-name"]').fill('Alpha edited');
		await page.locator('[data-test="add-edit-submit"]').click();
		await expect(page.locator('[data-test="add-edit-name"]')).not.toBeVisible();

		// Updated name is visible in the row.
		await expect(page.locator(`[data-test="row-${alphaId}"]`)).toContainText('Alpha edited');
	});

	// (f) Delete shows confirmation sheet; confirming shows snackbar with item name.
	test('(f) deleting shows confirmation then snackbar', async () => {
		await page.locator(`[data-test="row-${betaId}"]`).click();
		await expect(page.locator(`[data-test="panel-delete-${betaId}"]`)).toBeVisible();
		await page.locator(`[data-test="panel-delete-${betaId}"]`).click();

		// Confirmation sheet.
		await expect(page.locator('[data-test="delete-heading"]')).toContainText('Beta');
		await page.locator('[data-test="delete-confirm"]').click();

		// Snackbar appears with item name.
		await expect(page.locator('[data-test="undo-snackbar"]')).toBeVisible();
		await expect(page.locator('[data-test="undo-snackbar"]')).toContainText('Beta');
	});

	// (g) Tapping UNDO restores the item.
	test('(g) tapping UNDO restores the item', async () => {
		await expect(page.locator('[data-test="undo-btn"]')).toBeVisible();
		await page.locator('[data-test="undo-btn"]').click();

		// Snackbar gone and Beta is back.
		await expect(page.locator('[data-test="undo-snackbar"]')).not.toBeVisible();
		await expect(page.locator(`[data-test="row-${betaId}"]`)).toBeVisible();
	});

	// (h) Back button returns to /lists.
	test('(h) back button returns to /lists', async () => {
		await page.locator('[data-test="topbar-back"]').click();
		await expect(page).toHaveURL(/\/lists$/);
	});

	// (i) An empty list shows the "Nothing here yet" empty state.
	test('(i) empty list shows empty state', async () => {
		// Create a new empty list.
		const runId = Date.now().toString(36);
		await page.locator('[data-test="lists-fab"]').click();
		await page.locator('[data-test="create-list-name"]').fill(`Empty test ${runId}`);
		await page.locator('[data-test="create-list-submit"]').click();

		// Navigate into it — it should be the newest list (first in the list).
		await page.locator('[data-test^="list-nav-"]').first().click();

		await expect(page.locator('[data-test="items-empty"]')).toBeVisible();
		await expect(page.locator('[data-test="items-empty"]')).toContainText('Nothing here yet');
		await expect(page.locator('.empty-cta')).toContainText('Add the first item');
	});
});
