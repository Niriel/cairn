import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Invite flow end-to-end: Alice creates a list, opens the picker from the
// Members screen, and sends an invite to Bob by e-mail. Bob signs in,
// sees the single-invite banner, accepts, lands on the list, and is
// prompted to add Alice to his circle.

test.describe.serial('invite flow', () => {
	let alice: Page;
	let bob: Page;
	let runId: string;
	let aliceEmail: string;
	let bobEmail: string;
	let listId: string;

	test.beforeAll(async ({ browser }) => {
		runId = Date.now().toString(36);
		aliceEmail = `alice+invites-${runId}@example.test`;
		bobEmail = `bob+invites-${runId}@example.test`;

		alice = await browser.newPage();
		bob = await browser.newPage();

		// Sign Alice in.
		await alice.goto('/');
		await expect(alice).toHaveURL(/\/auth\/login$/);
		await alice.locator('[data-test="login-email"]').fill(aliceEmail);
		await alice.locator('[data-test="login-submit"]').click();
		await expect(alice).toHaveURL(/\/auth\/check$/);
		const aliceLink = (await waitForMagicLink(aliceEmail)).link;
		await alice.goto(aliceLink);
		await expect(alice).toHaveURL(/\/lists$/);

		// Sign Bob in (creates his profile so the invite-by-email resolves).
		await bob.goto('/');
		await bob.locator('[data-test="login-email"]').fill(bobEmail);
		await bob.locator('[data-test="login-submit"]').click();
		const bobLink = (await waitForMagicLink(bobEmail)).link;
		await bob.goto(bobLink);
		await expect(bob).toHaveURL(/\/lists$/);

		// Alice creates a list.
		await alice.locator('[data-test="lists-fab"]').click();
		await alice.locator('[data-test="create-list-name"]').fill(`Invite test ${runId}`);
		await alice.locator('[data-test="create-list-submit"]').click();

		const listRow = alice.locator('[data-test^="list-nav-"]').first();
		const navAttr = await listRow.getAttribute('data-test');
		listId = navAttr!.replace('list-nav-', '');
	});

	test.afterAll(async () => {
		await alice.close();
		await bob.close();
	});

	test('(a) Alice invites Bob by e-mail from the picker', async () => {
		await alice.goto(`/lists/${listId}/members`);
		await expect(alice.locator('[data-test="members-screen"]')).toBeVisible();
		await alice.locator('[data-test="members-add"]').click();
		await expect(alice.locator('[data-test="invite-picker"]')).toBeVisible();

		await alice.locator('[data-test="invite-picker-email-input"]').fill(bobEmail);
		await alice.locator('[data-test="invite-picker-email-send"]').click();

		// Anti-enumeration toast — same message regardless of whether the
		// e-mail belongs to a Cairn account. Crucially, no echo of bobEmail.
		const toast = alice.locator('[data-test="invite-picker-toast"]');
		await expect(toast).toBeVisible();
		await expect(toast).toContainText('If they have a Cairn account');
		await expect(toast).not.toContainText(bobEmail);
	});

	test('(b) Bob sees the single-invite banner and accepts', async () => {
		await bob.goto('/lists');
		const banner = bob.locator('[data-test="invites-banner"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText(`Invite test ${runId}`);

		await bob.locator('[data-test="invites-banner-accept"]').click();
		await expect(bob).toHaveURL(new RegExp(`/lists/${listId}$`));
	});

	test('(c) post-accept prompt offers to add the inviter to the circle', async () => {
		const prompt = bob.locator('[data-test="post-accept-prompt"]');
		await expect(prompt).toBeVisible();
		await bob.locator('[data-test="post-accept-add-to-circle"]').click();
		await expect(prompt).not.toBeVisible();
	});

	test('(d) banner is gone after the only pending invite is accepted', async () => {
		await bob.goto('/lists');
		await expect(bob.locator('[data-test="invites-banner"]')).not.toBeVisible();
	});
});
