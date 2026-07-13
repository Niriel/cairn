import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Block flow: Alice and Bob share a list. Alice blocks Bob from his
// ProfileSheet on the Members screen. Bob then tries to invite Alice by
// username from a different list — the block makes send_invitation return the
// silent-fail outcome, so the picker shows the generic "Couldn't send invite"
// toast. That generic wording is the anti-enumeration guarantee: a block is
// indistinguishable from a restrictive invite policy (docs/invites.md).

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('block flow', () => {
	let alice: Page;
	let bob: Page;
	let runId: string;
	let aliceUsername: string;
	let bobUsername: string;
	let sharedListId: string;
	let bobListId: string;
	let bobUid: string;

	test.beforeAll(async ({ browser }) => {
		runId = Date.now().toString(36);
		aliceUsername = uniqueUsername('blkalice');
		bobUsername = uniqueUsername('blkbob');

		alice = await browser.newPage();
		bob = await browser.newPage();

		// Both need known handles: Alice invites Bob in setup, Bob invites Alice
		// in step (b).
		await register(alice, aliceUsername, PASSWORD);
		await register(bob, bobUsername, PASSWORD);

		// Alice creates the shared list.
		await alice.locator('[data-test="lists-fab"]').click();
		await alice.locator('[data-test="create-list-name"]').fill(`Block shared ${runId}`);
		await alice.locator('[data-test="create-list-submit"]').click();
		const sharedRow = alice.locator('[data-test^="list-nav-"]').first();
		sharedListId = (await sharedRow.getAttribute('data-test'))!.replace('list-nav-', '');

		// Alice invites Bob to it by username.
		await alice.goto(`/lists/${sharedListId}/members`);
		await alice.locator('[data-test="members-add"]').click();
		await alice.locator('[data-test="invite-picker-username-input"]').fill(bobUsername);
		await alice.locator('[data-test="invite-picker-username-send"]').click();
		await expect(alice.locator('[data-test="invite-picker-toast"]')).toContainText('Invite sent');

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
		// Capture by name, not position: after accepting the shared list Bob is a
		// member of two lists, and reading `.first()` raced onto the shared list
		// (which Alice owns, so she is a member) — sending the step-(b) invite to a
		// list Alice is already on. Filtering by the just-created name is stable.
		const bobRow = bob
			.locator('[data-test^="list-nav-"]')
			.filter({ hasText: `Bob's list ${runId}` });
		await expect(bobRow).toBeVisible();
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

	test("(b) Bob's invite to Alice gets the generic failure — the block doesn't leak", async () => {
		await bob.goto(`/lists/${bobListId}/members`);
		await bob.locator('[data-test="members-add"]').click();
		await expect(bob.locator('[data-test="invite-picker"]')).toBeVisible();

		await bob.locator('[data-test="invite-picker-username-input"]').fill(aliceUsername);
		await bob.locator('[data-test="invite-picker-username-send"]').click();

		// Anti-enumeration: the block yields the same generic "Couldn't send
		// invite" as a restrictive policy would, so Bob cannot tell he was
		// blocked (as opposed to Alice simply not accepting invites). Crucially
		// it is NOT the "No such username" a missing handle returns — Alice's
		// account plainly exists.
		const toast = bob.locator('[data-test="invite-picker-toast"]');
		await expect(toast).toBeVisible();
		await expect(toast).toContainText("Couldn't send invite");
	});
});
