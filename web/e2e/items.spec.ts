import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Items flow: serial because each step builds on the previous one.
// Login → create list → add items → exercise accordion, voting, edit, delete/undo.

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('items flow', () => {
	let page: Page;
	let listId: string;
	let alphaId: string;
	let betaId: string;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();

		const runId = Date.now().toString(36);
		await register(page, uniqueUsername('itemsuser'), PASSWORD);

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

		// Capture item IDs from data-test attributes.
		const alphaRowTap = page.locator('[data-test^="row-"]', { hasText: 'Alpha' }).first();
		const alphaAttr = await alphaRowTap.getAttribute('data-test');
		alphaId = alphaAttr!.replace('row-', '');

		const betaRowTap = page.locator('[data-test^="row-"]', { hasText: 'Beta' }).first();
		const betaAttr = await betaRowTap.getAttribute('data-test');
		betaId = betaAttr!.replace('row-', '');

		// Vote +1 on Beta so it outscores Alpha (alphabetical-order test: the vote
		// must not move it).
		// The vote control lives in the extra panel, so open Beta's row first.
		await page.locator(`[data-test="row-${betaId}"]`).click();
		const betaPanel = page.locator('[data-test="item-extra"]');
		await betaPanel.locator('[data-test="vote-up"]').click();
		await expect(betaPanel.locator('[data-test="vote-indicator"]')).toHaveText('+');
		await page.locator(`[data-test="row-${betaId}"]`).click(); // close the panel

		// Navigate back to /lists so test (a) starts from there.
		await page.locator('[data-test="topbar-back"]').click();
		await expect(page).toHaveURL(/\/lists$/);
	});

	test.afterAll(async () => {
		await page.close();
	});

	// (a) Navigate from lists → items; items rendered in alphabetical order.
	test('(a) navigating into a list shows items alphabetically', async () => {
		await page.locator(`[data-test="list-nav-${listId}"]`).click();
		await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));

		// Alpha (score 0) stays before Beta (score +1): votes don't reorder.
		const rows = page.locator('[data-test^="row-"]');
		await expect(rows.first()).toContainText('Alpha');
		await expect(rows.nth(1)).toContainText('Beta');
	});

	// (b) Tapping a row opens its panel; tapping again closes it.
	test('(b) accordion opens on tap, closes on second tap', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-extra"]')).toBeVisible();

		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-extra"]')).not.toBeVisible();
	});

	// (b-overflow) From an open row, More opens the overflow sheet; the back
	// button closes the sheet without navigating away from the Items screen.
	test('(b-overflow) back closes the overflow sheet, staying on Items', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await page.locator(`[data-test="item-overflow-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-overflow-edit"]')).toBeVisible();

		await page.goBack();
		await expect(page.locator('[data-test="item-overflow-edit"]')).not.toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));
		// The row stays open under the sheet's backdrop.
		await expect(page.locator('[data-test="item-extra"]')).toBeVisible();

		await page.locator(`[data-test="row-${alphaId}"]`).click(); // close the panel
	});

	// (b-overflow-edit) More → Edit, then back from the edit sheet returns to the
	// open Items screen (not a ghost overflow sheet).
	test('(b-overflow-edit) back from the edit sheet returns to the open row', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await page.locator(`[data-test="item-overflow-${alphaId}"]`).click();
		await page.locator('[data-test="item-overflow-edit"]').click();
		await expect(page.locator('[data-test="add-edit-name"]')).toBeVisible();

		await page.goBack();
		await expect(page.locator('[data-test="add-edit-name"]')).not.toBeVisible();
		await expect(page.locator('[data-test="item-overflow-edit"]')).not.toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));
		await expect(page.locator('[data-test="item-extra"]')).toBeVisible();

		await page.locator(`[data-test="row-${alphaId}"]`).click(); // close the panel
	});

	// (b-overflow-delete) More → Delete, then back from the confirm sheet returns
	// to the open Items screen (not a ghost overflow sheet).
	test('(b-overflow-delete) back from the delete sheet returns to the open row', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await page.locator(`[data-test="item-overflow-${alphaId}"]`).click();
		await page.locator('[data-test="item-overflow-delete"]').click();
		await expect(page.locator('[data-test="delete-heading"]')).toBeVisible();

		await page.goBack();
		await expect(page.locator('[data-test="delete-heading"]')).not.toBeVisible();
		await expect(page.locator('[data-test="item-overflow-edit"]')).not.toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));
		await expect(page.locator('[data-test="item-extra"]')).toBeVisible();

		await page.locator(`[data-test="row-${alphaId}"]`).click(); // close the panel
	});

	// (c) Opening a second row closes the first.
	test('(c) opening second row closes first', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator('[data-test="item-extra"]')).toBeVisible();

		await page.locator(`[data-test="row-${betaId}"]`).click();
		// Only one panel should be visible (Beta's).
		await expect(page.locator('[data-test="item-extra"]')).toHaveCount(1);
		await expect(page.locator(`[data-test="item-overflow-${betaId}"]`)).toBeVisible();
		await expect(page.locator(`[data-test="item-overflow-${alphaId}"]`)).not.toBeVisible();

		// Close.
		await page.locator(`[data-test="row-${betaId}"]`).click();
	});

	// (d) Voting up on an item updates the indicator. The vote control lives in
	// the extra panel, so open the row first.
	test('(d) voting up updates the vote indicator', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		const panel = page.locator('[data-test="item-extra"]');
		const alphaIndicator = panel.locator('[data-test="vote-indicator"]');

		await expect(alphaIndicator).toHaveText('0');
		await panel.locator('[data-test="vote-up"]').click();
		await expect(alphaIndicator).toHaveText('+');

		await page.locator(`[data-test="row-${alphaId}"]`).click(); // close the panel
	});

	// (e) Edit sheet opens with pre-populated fields; saving updates the name.
	test('(e) editing an item updates its name', async () => {
		await page.locator(`[data-test="row-${alphaId}"]`).click();
		await expect(page.locator(`[data-test="item-overflow-${alphaId}"]`)).toBeVisible();
		await page.locator(`[data-test="item-overflow-${alphaId}"]`).click();
		await page.locator('[data-test="item-overflow-edit"]').click();

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
		await expect(page.locator(`[data-test="item-overflow-${betaId}"]`)).toBeVisible();
		await page.locator(`[data-test="item-overflow-${betaId}"]`).click();
		await page.locator('[data-test="item-overflow-delete"]').click();

		// Confirmation sheet.
		await expect(page.locator('[data-test="delete-heading"]')).toContainText('Beta');
		await page.locator('[data-test="delete-confirm"]').click();

		// Snackbar appears with item name.
		await expect(page.locator('[data-test="undo-snackbar"]')).toBeVisible();
		await expect(page.locator('[data-test="undo-snackbar"]')).toContainText('Beta');
	});

	// (g) Tapping UNDO restores the item.
	test('(g) tapping UNDO restores the item', async () => {
		await expect(page.locator('[data-test="undo-snackbar-action"]')).toBeVisible();
		await page.locator('[data-test="undo-snackbar-action"]').click();

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

		// Navigate into it — by name, not position: lists sort alphabetically.
		await page
			.locator('[data-test^="list-nav-"]')
			.filter({ hasText: `Empty test ${runId}` })
			.click();

		await expect(page.locator('[data-test="items-empty"]')).toBeVisible();
		await expect(page.locator('[data-test="items-empty"]')).toContainText('Nothing here yet');
		await expect(page.getByRole('button', { name: 'Add the first item' })).toBeVisible();
	});
});
