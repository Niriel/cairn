import { expect, test } from '@playwright/test';

import { waitForMagicLink } from './helpers/mailpit';

// One spec, two independent tests — see plans/0300_auth_http_client/TASKS.md 5.2.
// The dev-shortcut test probes the DOM for the button rather than reading
// VITE_DEV_LOGIN_SHORTCUT from process.env: VITE_* vars are baked into the
// bundle at build time, so the runner's env can diverge from what shipped.

test('magic-link happy path', async ({ page, context }) => {
	const email = `alice+${test.info().testId}@example.test`;

	await page.goto('/');
	await expect(page).toHaveURL(/\/auth\/login$/);

	await page.locator('[data-test="login-email"]').fill(email);
	await page.locator('[data-test="login-submit"]').click();

	// Anchored to end so a future drift that appends `?email=…` fails this
	// (R14 / privacy decision — the email must not leak via the URL).
	await expect(page).toHaveURL(/\/auth\/check$/);

	const link = await waitForMagicLink(email);
	await page.goto(link);

	await expect(page).toHaveURL(/\/$/);
	const cookies = await context.cookies();
	expect(cookies.find((c) => c.name === 'cairn_session')).toBeDefined();

	await page.locator('[data-test="signout"]').click();
	await expect(page).toHaveURL(/\/auth\/login$/);
	const cookiesAfter = await context.cookies();
	expect(cookiesAfter.find((c) => c.name === 'cairn_session')).toBeUndefined();
});

test('dev shortcut path', async ({ page, context }) => {
	await page.goto('/auth/login');

	const hasShortcut = (await page.locator('[data-test="dev-login-alice"]').count()) > 0;
	test.skip(!hasShortcut, 'dev shortcut not present in this build');

	await page.locator('[data-test="dev-login-alice"]').click();

	await expect(page).toHaveURL(/\/$/);
	const cookies = await context.cookies();
	expect(cookies.find((c) => c.name === 'cairn_session')).toBeDefined();
});
