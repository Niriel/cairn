import { expect, test } from '@playwright/test';

// The imprint is a minimal operator/contact page (German DDG §5 minimum),
// reachable pre-auth from the sign-in footer. See plans/1500_production_rollout
// TASKS 6.1.
test('imprint is reachable from the sign-in footer and shows the contact line', async ({
	page
}) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/auth\/signin$/);

	await page.locator('[data-test="signin-imprint-link"]').click();
	await expect(page).toHaveURL(/\/imprint$/);

	await expect(page.locator('[data-test="imprint-screen"]')).toBeVisible();
	await expect(page.locator('[data-test="imprint-operator"]')).toBeVisible();
	await expect(page.locator('[data-test="imprint-address"]')).toBeVisible();
	// The contact line is an e-mail address (placeholder), so it carries an @.
	await expect(page.locator('[data-test="imprint-email"]')).toContainText('@');
});
