import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Privacy flow: Alice has a pending invite from Bob. She switches her
// invite policy to "Nobody"; the cascade declines the pending invite,
// the banner on ListsScreen disappears, and the Settings → Invites row
// shows "No pending invites".

test.describe.serial('privacy flow', () => {
	let alice: Page;
	let bob: Page;
	let runId: string;
	let aliceEmail: string;
	let bobEmail: string;
	let bobListId: string;

	async function signIn(page: Page, email: string): Promise<void> {
		await page.goto('/');
		await expect(page).toHaveURL(/\/auth\/login$/);
		await page.locator('[data-test="login-email"]').fill(email);
		await page.locator('[data-test="login-submit"]').click();
		await expect(page).toHaveURL(/\/auth\/check$/);
		const { link } = await waitForMagicLink(email);
		await page.goto(link);
		await expect(page).toHaveURL(/\/lists$/);
	}

	test.beforeAll(async ({ browser }) => {
		runId = Date.now().toString(36);
		aliceEmail = `alice+privacy-${runId}@example.test`;
		bobEmail = `bob+privacy-${runId}@example.test`;

		alice = await browser.newPage();
		bob = await browser.newPage();

		await signIn(alice, aliceEmail);
		await signIn(bob, bobEmail);

		// Bob creates a list and invites Alice.
		await bob.locator('[data-test="lists-fab"]').click();
		await bob.locator('[data-test="create-list-name"]').fill(`Privacy test ${runId}`);
		await bob.locator('[data-test="create-list-submit"]').click();
		const bobRow = bob.locator('[data-test^="list-nav-"]').first();
		bobListId = (await bobRow.getAttribute('data-test'))!.replace('list-nav-', '');

		await bob.goto(`/lists/${bobListId}/members`);
		await bob.locator('[data-test="members-add"]').click();
		await bob.locator('[data-test="invite-picker-email-input"]').fill(aliceEmail);
		await bob.locator('[data-test="invite-picker-email-send"]').click();
		await expect(bob.locator('[data-test="invite-picker-toast"]')).toBeVisible();

		// Confirm Alice sees the banner before we tighten her policy.
		await alice.goto('/lists');
		await expect(alice.locator('[data-test="invites-banner"]')).toBeVisible();
	});

	test.afterAll(async () => {
		await alice.close();
		await bob.close();
	});

	test('(a) tightening policy to Nobody cascades a decline', async () => {
		await alice.goto('/settings/privacy');
		await expect(alice.locator('[data-test="privacy-screen"]')).toBeVisible();
		await alice.locator('[data-test="policy-nobody"]').click();
		await expect(alice.locator('[data-test="cascade-note"]')).toContainText(
			'pending invite has been declined'
		);
	});

	test('(b) banner is gone on /lists', async () => {
		await alice.goto('/lists');
		await expect(alice.locator('[data-test="invites-banner"]')).not.toBeVisible();
	});

	test('(c) Settings → Invites row shows "No pending invites"', async () => {
		await alice.goto('/settings');
		await expect(alice.locator('[data-test="settings-invites"]')).toContainText(
			'No pending invites'
		);
	});
});
