// Username + password auth helpers shared across e2e specs. Since 2003 the
// real sign-in path is username + password (the magic-link screen at
// /auth/login still exists but is a separate flow); specs that need a user
// with a *known* handle — so they can be invited or circle-added by it —
// register through this helper rather than the magic-link flow, which only
// ever mints an unguessable provisional username.

import { expect, type Page } from '@playwright/test';

// A username that satisfies the `^[A-Za-z0-9]{3,30}$` rule and is unique per
// run, so repeated runs against the shared dev DB never collide on the
// case-fold uniqueness index. The prefix must be alphanumeric too (no
// hyphens) to stay within the format rule.
export function uniqueUsername(prefix = 'e2e'): string {
	return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Register a fresh account through the real /auth/register flow and land
// signed-in on /lists.
export async function register(page: Page, username: string, password: string): Promise<void> {
	await page.goto('/auth/register');
	await page.locator('[data-test="register-username"]').fill(username);
	await page.locator('[data-test="register-password"]').fill(password);
	await page.locator('[data-test="register-submit"]').click();
	await expect(page).toHaveURL(/\/lists$/);
}

// Sign in through the real /auth/signin flow and land signed-in on /lists.
export async function signInWithPassword(
	page: Page,
	username: string,
	password: string
): Promise<void> {
	await page.goto('/auth/signin');
	await page.locator('[data-test="signin-username"]').fill(username);
	await page.locator('[data-test="signin-password"]').fill(password);
	await page.locator('[data-test="signin-submit"]').click();
	await expect(page).toHaveURL(/\/lists$/);
}
