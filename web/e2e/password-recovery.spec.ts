import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { expectNoRecoveryMail, waitForRecoveryCode } from './helpers/mailpit';

// The whole password-recovery flow end to end against the real backend (the
// Vite cookie-plant proxy's recovery handlers + Mailpit + PostgREST). The
// load-bearing property no other layer can prove: a password written by the
// pgcrypto reset_password RPC is actually accepted by GoTrue's password grant.
// pgTAP has no GoTrue; the Vitest component tests mock the network. Only this
// spec runs the real coupling. See plans/2004_password_recovery/TASKS.md 4.1.

const VERIFY_SUBJECT = 'Confirm your recovery e-mail';
const RESET_SUBJECT = 'Reset your Cairn password';

// A username satisfying `^[A-Za-z0-9]{3,30}$`, unique per run so repeated runs
// against the shared dev DB never collide on the case-fold uniqueness index.
function uniqueUsername(prefix = 'rec'): string {
	return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Register a fresh account through the real /auth/register flow and land
// signed-in on /lists.
async function register(page: Page, username: string, password: string): Promise<void> {
	await page.goto('/auth/register');
	await page.locator('[data-test="register-username"]').fill(username);
	await page.locator('[data-test="register-password"]').fill(password);
	await page.locator('[data-test="register-submit"]').click();
	await expect(page).toHaveURL(/\/lists$/);
}

// Sign in through the real /auth/signin flow and land signed-in on /lists.
async function signInWithPassword(page: Page, username: string, password: string): Promise<void> {
	await page.goto('/auth/signin');
	await page.locator('[data-test="signin-username"]').fill(username);
	await page.locator('[data-test="signin-password"]').fill(password);
	await page.locator('[data-test="signin-submit"]').click();
	await expect(page).toHaveURL(/\/lists$/);
}

async function signOut(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.locator('[data-test="signout"]').click();
	await expect(page).toHaveURL(/\/auth\/signin$/);
}

// Set a recovery e-mail from Settings and confirm it with the e-mailed code,
// leaving the verified address shown in the row.
async function setAndConfirmRecoveryEmail(page: Page, recoveryEmail: string): Promise<void> {
	await page.goto('/settings');
	await page.locator('[data-test="recovery-email-add"]').click();
	await page.locator('[data-test="recovery-email-input"]').fill(recoveryEmail);
	await page.locator('[data-test="recovery-email-submit"]').click();

	// The verify code arrives at the candidate address; entering it confirms.
	const code = await waitForRecoveryCode(recoveryEmail, VERIFY_SUBJECT);
	await page.locator('[data-test="recovery-email-code"]').fill(code);
	await page.locator('[data-test="recovery-email-verify"]').click();

	await expect(page.locator('[data-test="recovery-email-address"]')).toHaveText(recoveryEmail);
}

test('full recovery: set recovery e-mail, reset password, sign in with the new one', async ({
	page
}) => {
	const username = uniqueUsername();
	const oldPassword = 'cairn-old-pw';
	const newPassword = 'cairn-new-pw';
	const recoveryEmail = `recovery+${test.info().testId}@example.test`;

	// Register, then set + verify a recovery e-mail.
	await register(page, username, oldPassword);
	await setAndConfirmRecoveryEmail(page, recoveryEmail);

	// Sign out and start the signed-out reset by username.
	await signOut(page);
	await page.goto('/auth/forgot-password');
	await page.locator('[data-test="forgot-username"]').fill(username);
	await page.locator('[data-test="forgot-submit"]').click();
	await expect(page).toHaveURL(/\/auth\/reset-password$/);

	// Read the reset code from Mailpit, set a new password.
	const resetCode = await waitForRecoveryCode(recoveryEmail, RESET_SUBJECT);
	await page.locator('[data-test="reset-username"]').fill(username);
	await page.locator('[data-test="reset-code"]').fill(resetCode);
	await page.locator('[data-test="reset-password-input"]').fill(newPassword);
	await page.locator('[data-test="reset-submit"]').click();

	// No auto-login — the reset lands the user on the sign-in screen.
	await expect(page).toHaveURL(/\/auth\/signin$/);

	// The load-bearing assertion: the pgcrypto-written password is accepted by
	// GoTrue's password grant — the new password signs in.
	await signInWithPassword(page, username, newPassword);

	// ...and the old password no longer works.
	await signOut(page);
	await page.goto('/auth/signin');
	await page.locator('[data-test="signin-username"]').fill(username);
	await page.locator('[data-test="signin-password"]').fill(oldPassword);
	await page.locator('[data-test="signin-submit"]').click();
	await expect(page.locator('[data-test="signin-error"]')).toBeVisible();
	await expect(page).toHaveURL(/\/auth\/signin$/);
});

test('a bad reset code is rejected inline and does not change the password', async ({ page }) => {
	const username = uniqueUsername('badcode');
	const password = 'cairn-keep-pw';
	const recoveryEmail = `recovery+${test.info().testId}@example.test`;

	await register(page, username, password);
	await setAndConfirmRecoveryEmail(page, recoveryEmail);
	await signOut(page);

	await page.goto('/auth/forgot-password');
	await page.locator('[data-test="forgot-username"]').fill(username);
	await page.locator('[data-test="forgot-submit"]').click();
	await expect(page).toHaveURL(/\/auth\/reset-password$/);

	// A wrong six-digit code: inline error, no navigation away.
	await page.locator('[data-test="reset-username"]').fill(username);
	await page.locator('[data-test="reset-code"]').fill('000000');
	await page.locator('[data-test="reset-password-input"]').fill('cairn-would-be-new');
	await page.locator('[data-test="reset-submit"]').click();
	await expect(page.locator('[data-test="reset-error"]')).toBeVisible();
	await expect(page).toHaveURL(/\/auth\/reset-password$/);

	// The original password still works — the bad code changed nothing.
	await page.goto('/auth/signin');
	await signInWithPassword(page, username, password);
});

test('forgot-password for an unknown username: identical screen, no mail sent', async ({
	page
}) => {
	const unknownUsername = uniqueUsername('nobody');
	// A probe address that nothing should ever mail; if the BFF leaked the
	// typed value into a send, a reset mail derived from this flow would appear.
	const probe = `recovery+noenum-${test.info().testId}@example.test`;

	await page.goto('/auth/forgot-password');
	await page.locator('[data-test="forgot-username"]').fill(unknownUsername);
	await page.locator('[data-test="forgot-submit"]').click();

	// Same destination as a real username — the signed-out path reveals nothing.
	await expect(page).toHaveURL(/\/auth\/reset-password$/);
	await expect(page.locator('[data-test="reset-submit"]')).toBeVisible();

	// And no reset mail is produced for the unknown account.
	expect(await expectNoRecoveryMail(probe, RESET_SUBJECT)).toBe(true);
});
