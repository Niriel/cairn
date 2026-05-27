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

	const { link, html, text } = await waitForMagicLink(email);

	expect(/\b\d{6}\b/.test(html)).toBe(false);
	expect(/\b\d{6}\b/.test(text)).toBe(false);

	// Playwright follows the GoTrue /verify → 302 → /auth/callback#… chain
	// automatically; the callback page strips the hash and JS-navigates to
	// /, which then redirects to /lists.
	await page.goto(link);
	await expect(page).toHaveURL(/\/lists$/);

	const session = (await context.cookies()).find((c) => c.name === 'cairn_session');
	expect(session).toBeDefined();
	expect(session?.httpOnly).toBe(true);
	expect(session?.sameSite).toBe('Lax');

	await page.goto('/settings');
	await page.locator('[data-test="signout"]').click();
	await expect(page).toHaveURL(/\/auth\/login$/);
	const sessionAfter = (await context.cookies()).find((c) => c.name === 'cairn_session');
	expect(sessionAfter).toBeUndefined();
});

test('magic-link non-2xx still lands on /auth/check (anti-enumeration)', async ({ page }) => {
	const email = `alice+${test.info().testId}@example.test`;

	await page.route('**/auth/magiclink*', (route) =>
		route.fulfill({ status: 429, contentType: 'application/json', body: '{}' })
	);

	await page.goto('/');
	await expect(page).toHaveURL(/\/auth\/login$/);

	await page.locator('[data-test="login-email"]').fill(email);
	await page.locator('[data-test="login-submit"]').click();

	await expect(page).toHaveURL(/\/auth\/check$/);
	await expect(page.locator('[data-test="login-check-heading"]')).toHaveText('Check your inbox');
	await expect(page.locator('[data-test="login-check-email"]')).toHaveText(email);
});
