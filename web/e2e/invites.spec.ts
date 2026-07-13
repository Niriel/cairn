import { expect, test, type Page } from '@playwright/test';

import { register, uniqueUsername } from './helpers/auth';

// Invite flow end-to-end: Alice registers, creates a list, opens the picker
// from the Members screen, and invites Bob by username. Bob — registered with
// a known handle so Alice can type it — signs in, sees the single-invite
// banner, accepts, lands on the list, and is prompted to add Alice to his
// circle. Once Bob is a member his @username disambiguates him on the members
// screen and profile sheet, and typing a handle that resolves to no account
// gets the truthful "No one on Cairn has that username" miss. (Usernames are
// public, so the picker reports the outcome plainly; there is no e-mail and no
// anti-enumeration hedge on this path.)

const PASSWORD = 'cairn-e2e-pw';

test.describe.serial('invite flow', () => {
	let alice: Page;
	let bob: Page;
	let runId: string;
	let bobUsername: string;
	let listId: string;

	test.beforeAll(async ({ browser }) => {
		runId = Date.now().toString(36);
		bobUsername = uniqueUsername('invbob');

		alice = await browser.newPage();
		bob = await browser.newPage();

		// Register both accounts. Bob needs a known username so Alice can invite
		// him by it; Alice just needs to be signed in to own a list.
		await register(alice, uniqueUsername('invalice'), PASSWORD);
		await register(bob, bobUsername, PASSWORD);

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

	test('(a) Alice invites Bob by username from the picker', async () => {
		await alice.goto(`/lists/${listId}/members`);
		await expect(alice.locator('[data-test="members-screen"]')).toBeVisible();
		await alice.locator('[data-test="members-add"]').click();
		await expect(alice.locator('[data-test="invite-picker"]')).toBeVisible();

		await alice.locator('[data-test="invite-picker-username-input"]').fill(bobUsername);
		await alice.locator('[data-test="invite-picker-username-send"]').click();

		// The handle resolved to a real account that accepts invites, so the
		// picker reports the send plainly.
		const toast = alice.locator('[data-test="invite-picker-toast"]');
		await expect(toast).toBeVisible();
		await expect(toast).toContainText('Invite sent');
	});

	test('(b) Bob sees the single-invite banner and accepts', async () => {
		await bob.goto('/lists');
		const banner = bob.locator('[data-test="invites-banner"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText(`Invite test ${runId}`);

		// The invited list lives in the banner only — it must NOT appear as a
		// collection card until Bob accepts (lists_select lets him read the row
		// for the banner embed, but the collection is gated to actual members).
		await expect(bob.locator(`[data-test="list-row-${listId}"]`)).toHaveCount(0);

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

	test("(e) Bob's @username shows on the members screen and, prominently, the profile sheet", async () => {
		// Bob is now a member (he accepted in (b)), so his handle disambiguates
		// him wherever he appears — the members row and the profile sheet.
		await alice.goto(`/lists/${listId}/members`);
		await expect(alice.locator('[data-test="members-screen"]')).toBeVisible();
		await expect(alice.locator('[data-test="members-screen"]')).toContainText(`@${bobUsername}`);

		// Tapping Bob's row (the non-self, enabled member row) opens his sheet,
		// where the handle sits on its own line under the display name.
		await alice.locator('[data-test^="member-row-"]:not([disabled])').first().click();
		await expect(alice.locator('[data-test="profile-sheet"]')).toBeVisible();
		await expect(alice.locator('[data-test="profile-handle"]')).toHaveText(`@${bobUsername}`);
	});

	test('(f) typing a nonexistent handle shows the truthful miss, not the generic failure', async () => {
		await alice.goto(`/lists/${listId}/members`);
		await alice.locator('[data-test="members-add"]').click();
		await expect(alice.locator('[data-test="invite-picker"]')).toBeVisible();

		// A handle that resolves to no account: usernames are public, so the
		// picker is truthful about the miss (distinct from the generic
		// "Couldn't send invite" a block or restrictive policy yields).
		await alice.locator('[data-test="invite-picker-username-input"]').fill(uniqueUsername('ghost'));
		await alice.locator('[data-test="invite-picker-username-send"]').click();

		const toast = alice.locator('[data-test="invite-picker-toast"]');
		await expect(toast).toBeVisible();
		await expect(toast).toContainText('No one on Cairn has that username');
	});
});
