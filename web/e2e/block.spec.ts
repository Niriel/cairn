import { expect, test, type Page } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Block flow: Alice and Bob share a list. Alice blocks Bob from his
// ProfileSheet on the Members screen. Bob then tries to invite Alice
// from a different list — the picker shows the generic anti-enumeration
// toast (no Alice e-mail echoed). The block must not leak the e-mail.

test.describe.serial('block flow', () => {
	let alice: Page;
	let bob: Page;
	let runId: string;
	let aliceEmail: string;
	let bobEmail: string;
	let sharedListId: string;
	let bobListId: string;
	let bobUid: string;

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
		aliceEmail = `alice+block-${runId}@example.test`;
		bobEmail = `bob+block-${runId}@example.test`;

		alice = await browser.newPage();
		bob = await browser.newPage();

		await signIn(alice, aliceEmail);
		await signIn(bob, bobEmail);

		// Alice creates the shared list.
		await alice.locator('[data-test="lists-fab"]').click();
		await alice.locator('[data-test="create-list-name"]').fill(`Block shared ${runId}`);
		await alice.locator('[data-test="create-list-submit"]').click();
		const sharedRow = alice.locator('[data-test^="list-nav-"]').first();
		sharedListId = (await sharedRow.getAttribute('data-test'))!.replace('list-nav-', '');

		// Alice invites Bob to it.
		await alice.goto(`/lists/${sharedListId}/members`);
		await alice.locator('[data-test="members-add"]').click();
		await alice.locator('[data-test="invite-picker-email-input"]').fill(bobEmail);
		await alice.locator('[data-test="invite-picker-email-send"]').click();
		await expect(alice.locator('[data-test="invite-picker-toast"]')).toBeVisible();

		// Bob accepts so they share the list and the members screen has a Bob row for Alice to tap.
		await bob.goto('/lists');
		await expect(bob.locator('[data-test="invites-banner"]')).toBeVisible();
		await bob.locator('[data-test="invites-banner-accept"]').click();
		await expect(bob).toHaveURL(new RegExp(`/lists/${sharedListId}$`));
		// Dismiss any post-accept prompt.
		const prompt = bob.locator('[data-test="post-accept-prompt"]');
		if (await prompt.isVisible().catch(() => false)) {
			await bob.locator('[data-test="post-accept-not-now"]').click();
		}

		// Bob creates a separate list of his own (used in step (b) for the
		// post-block send attempt).
		await bob.goto('/lists');
		await bob.locator('[data-test="lists-fab"]').click();
		await bob.locator('[data-test="create-list-name"]').fill(`Bob's list ${runId}`);
		await bob.locator('[data-test="create-list-submit"]').click();
		const bobRow = bob.locator('[data-test^="list-nav-"]').first();
		bobListId = (await bobRow.getAttribute('data-test'))!.replace('list-nav-', '');

		// Capture Bob's uid from the shared list's members page (skip Alice's
		// own row, which renders as a disabled button — see MembersScreen).
		await alice.goto(`/lists/${sharedListId}/members`);
		const bobMemberRow = alice.locator('[data-test^="member-row-"]:not([disabled])').first();
		bobUid = (await bobMemberRow.getAttribute('data-test'))!.replace('member-row-', '');
	});

	test.afterAll(async () => {
		await alice.close();
		await bob.close();
	});

	test('(a) Alice blocks Bob from his ProfileSheet', async () => {
		await alice.goto(`/lists/${sharedListId}/members`);
		await alice.locator(`[data-test="member-row-${bobUid}"]`).click();
		await expect(alice.locator('[data-test="profile-sheet"]')).toBeVisible();
		await alice.locator('[data-test="block"]').click();
		await expect(alice.locator('[data-test="block-confirm"]')).toBeVisible();
		await alice.locator('[data-test="block-confirm-block"]').click();
		await expect(alice.locator('[data-test="profile-sheet"]')).not.toBeVisible();
	});

	test("(b) Bob's invite to Alice gets a generic toast — no e-mail echo", async () => {
		await bob.goto(`/lists/${bobListId}/members`);
		await bob.locator('[data-test="members-add"]').click();
		await expect(bob.locator('[data-test="invite-picker"]')).toBeVisible();

		await bob.locator('[data-test="invite-picker-email-input"]').fill(aliceEmail);
		await bob.locator('[data-test="invite-picker-email-send"]').click();

		const toast = bob.locator('[data-test="invite-picker-toast"]');
		await expect(toast).toBeVisible();
		// Anti-enumeration: same message as the happy path; Alice's e-mail
		// must never appear in the toast text.
		await expect(toast).not.toContainText(aliceEmail);
	});
});
