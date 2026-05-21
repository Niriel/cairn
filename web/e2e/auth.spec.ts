import { expect, test } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// Magic-link happy path + sign-out, end to end against the real backend
// (GoTrue + Mailpit + PostgREST + the Vite cookie-plant proxy). Dev-shortcut
// sign-in is exercised by Vitest component tests; this spec proves the full
// stack works. See plans/0300_auth_http_client/TASKS.md 6.4.

test('magic-link happy path and sign-out', async ({ page, context }) => {
	const email = `alice+${test.info().testId}@example.test`;

	await page.goto('/');
	await expect(page).toHaveURL(/\/auth\/login$/);

	await page.locator('[data-test="login-email"]').fill(email);
	await page.locator('[data-test="login-submit"]').click();

	// Anchored to end so a future drift that appends `?email=…` fails this
	// (R14 / privacy decision — the email must not leak via the URL).
	await expect(page).toHaveURL(/\/auth\/check$/);

	const link = await waitForMagicLink(email);

	// Playwright follows the GoTrue /verify → 302 → /auth/callback#… chain
	// automatically; the callback page strips the hash and JS-navigates to /.
	await page.goto(link);
	await expect(page).toHaveURL(/\/$/);

	const session = (await context.cookies()).find((c) => c.name === 'cairn_session');
	expect(session).toBeDefined();
	expect(session?.httpOnly).toBe(true);
	expect(session?.sameSite).toBe('Lax');

	await page.locator('[data-test="signout"]').click();
	await expect(page).toHaveURL(/\/auth\/login$/);
	const sessionAfter = (await context.cookies()).find((c) => c.name === 'cairn_session');
	expect(sessionAfter).toBeUndefined();
});
