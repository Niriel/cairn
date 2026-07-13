import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Privacy flow: Alice has a pending invite from Bob. She switches her
// invite policy to "Nobody"; the cascade declines the pending invite,
// the banner on ListsScreen disappears, and the Settings → Invites row
// shows "No pending invites".

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('privacy flow', () => {
	let alice: Page;
	let bob: Page;
	let runId: string;
	let aliceUsername: string;
	let bobListId: string;

	test.beforeAll(async ({ browser }) => {
		runId = Date.now().toString(36);
		aliceUsername = uniqueUsername('prvalice');

		alice = await browser.newPage();
		bob = await browser.newPage();

		// Alice needs a known handle so Bob can invite her by it; Bob just needs
		// to own a list. New accounts default to the 'everybody' invite policy,
		// so Bob's invite lands until Alice tightens it in (a).
		await register(alice, aliceUsername, PASSWORD);
		await register(bob, uniqueUsername('prvbob'), PASSWORD);

		// Bob creates a list and invites Alice by username.
		await bob.locator('[data-test="lists-fab"]').click();
		await bob.locator('[data-test="create-list-name"]').fill(`Privacy test ${runId}`);
		await bob.locator('[data-test="create-list-submit"]').click();
		const bobRow = bob.locator('[data-test^="list-nav-"]').first();
		bobListId = (await bobRow.getAttribute('data-test'))!.replace('list-nav-', '');

		await bob.goto(`/lists/${bobListId}/members`);
		await bob.locator('[data-test="members-add"]').click();
		await bob.locator('[data-test="invite-picker-username-input"]').fill(aliceUsername);
		await bob.locator('[data-test="invite-picker-username-send"]').click();
		await expect(bob.locator('[data-test="invite-picker-toast"]')).toContainText('Invite sent');

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
