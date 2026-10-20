import { expect, test } from '@playwright/test';

import { OPERATOR } from '../src/lib/legal/model/operator';

import { register, uniqueUsername } from './helpers/auth';

const PASSWORD = 'cairn-e2e-pw';

// The legal pages are public: the privacy notice, terms and imprint must be
// readable before anyone signs up. See docs/legal.md.
test.describe('legal pages, signed out', () => {
	for (const [link, path, screen] of [
		['legal-privacy-link', '/about/privacy', 'privacy-screen'],
		['legal-terms-link', '/about/terms', 'terms-screen'],
		['legal-imprint-link', '/about/imprint', 'imprint-screen']
	] as const) {
		test(`the sign-in footer opens ${path}`, async ({ page }) => {
			await page.goto('/');
			await expect(page).toHaveURL(/\/auth\/signin$/);
			await page.locator(`[data-test="${link}"]`).click();
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(page.locator(`[data-test="${screen}"]`)).toBeVisible();
		});
	}

	test('the imprint names the operator', async ({ page }) => {
		await page.goto('/about/imprint');
		await expect(page.locator('[data-test="imprint-address"]')).toContainText(OPERATOR.name);
		await expect(page.locator('[data-test="imprint-email"]')).toHaveText(OPERATOR.email);
	});

	test('the third-party licence texts are served', async ({ request }) => {
		const response = await request.get('/legal/licenses.txt');
		expect(response.status()).toBe(200);
		expect(await response.text()).toContain('MIT');
	});
});

test.describe('About hub, signed in', () => {
	test('Settings → About Cairn shows the version and opens every page', async ({ page }) => {
		await register(page, uniqueUsername('legal'), PASSWORD);

		await page.goto('/settings');
		await page.locator('[data-test="settings-about"]').click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.locator('[data-test="about-version"]')).toHaveText(
			/^v\d+\.\d+\.\d+ · build \d{4}-\d{2}-\d{2}$/
		);

		for (const [row, screen] of [
			['about-privacy', 'privacy-screen'],
			['about-terms', 'terms-screen'],
			['about-imprint', 'imprint-screen'],
			['about-open-source', 'open-source-screen'],
			['about-contact', 'contact-screen'],
			['about-license', 'license-screen']
		] as const) {
			await page.locator(`[data-test="${row}"]`).click();
			await expect(page.locator(`[data-test="${screen}"]`)).toBeVisible();
			await page.locator('[data-test="topbar-back"]').click();
			await expect(page.locator('[data-test="about-screen"]')).toBeVisible();
		}
	});
});
