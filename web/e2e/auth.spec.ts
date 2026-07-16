import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { CSRF_HEADER } from '../src/lib/shared/model/auth-paths';
import { register, signInWithPassword, uniqueUsername } from './helpers/auth';

// End-to-end auth against the real backend (GoTrue + PostgREST + the Vite
// cookie-plant proxy): the revocable-session behaviours (silent refresh,
// sign-out-everywhere, stale-cookie rejection) and the username + password
// credential flow. This proves the full stack works, which the mocked Vitest
// component tests cannot.

// Dev cookie names (unprefixed — localhost is plain HTTP, so the prod
// `__Host-` prefix is intentionally absent here; see Task 2.1). The durable
// cookie holds the rotating refresh token; the short-lived one holds the
// BFF-minted access JWT the data plane attaches as a bearer.
const DURABLE_COOKIE = 'cairn_session';
const ACCESS_COOKIE = 'cairn_access';

async function cookieNamed(context: BrowserContext, name: string) {
	return (await context.cookies()).find((c) => c.name === name);
}

// Sign out via the settings screen and land on the signed-out surface
// (the guard bounces signed-out visitors to /auth/signin).
async function signOut(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.locator('[data-test="signout"]').click();
	await expect(page).toHaveURL(/\/auth\/signin$/);
}

// A well-formed JWT whose `exp` is in the past. The signature is deliberately
// bogus: PostgREST rejects an expired *or* badly-signed bearer with 401 either
// way, and the only load-bearing property here is that a *present* bearer
// yields 401 — not the anon `200 []` an absent bearer would (PGRST_DB_ANON_ROLE
// is `anon`). Overwriting (not deleting) cairn_access is what exercises the
// refresh-on-401 interceptor; deleting it would test the wrong path. See Task
// 1.3's durable access-cookie Max-Age decision and Task 4.2's interceptor.
function expiredAccessJwt(): string {
	const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const now = Math.floor(Date.now() / 1000);
	const header = b64({ alg: 'HS256', typ: 'JWT' });
	const payload = b64({
		role: 'authenticated',
		aud: 'authenticated',
		sub: '00000000-0000-0000-0000-000000000000',
		iat: now - 7200,
		exp: now - 3600
	});
	return `${header}.${payload}.bogus-signature`;
}

// The revocable session's behaviours that a single happy-path can't show:
// silent refresh across access-token expiry, sign-out-everywhere killing a
// second session, and a stale pre-2002 cookie failing to authenticate.
test.describe('revocable session', () => {
	// (b) Silent refresh: when the access cookie's JWT has expired but the durable
	// refresh cookie is still valid, an /api call 401s, the interceptor refreshes
	// once, retries, and the user stays signed in — no bounce to sign-in.
	test('silent refresh on access-token expiry keeps the user signed in', async ({
		page,
		context
	}) => {
		// Any signed-in session exercises the refresh path; register a fresh
		// account per run (unique username) so concurrent projects don't collide.
		await register(page, uniqueUsername('refresh'), 'cairn-e2e-pw');

		// Overwrite the access cookie with an expired-but-well-formed JWT (NOT
		// delete it — see expiredAccessJwt). The next /api call carries this stale
		// bearer and PostgREST answers 401.
		const expired = expiredAccessJwt();
		await context.addCookies([
			{
				name: ACCESS_COOKIE,
				value: expired,
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				sameSite: 'Lax'
			}
		]);

		// Trigger an in-app /api fetch through the data layer (the 401-interceptor
		// lives in the pgGet wrapper, so a raw fetch wouldn't exercise it).
		await page.locator('[data-test="lists-refresh"]').click();

		// The silent /auth/refresh + retry fires: the user stays on /lists and a
		// fresh access cookie (different from the expired one we planted) appears.
		await expect(page).toHaveURL(/\/lists$/);
		await expect
			.poll(async () => (await cookieNamed(context, ACCESS_COOKIE))?.value)
			.not.toBe(expired);
		expect(await cookieNamed(context, ACCESS_COOKIE)).toBeDefined();
	});

	// (d) Sign-out-everywhere from one context revokes a *second* signed-in
	// session of the same user: that second context's next refresh 401s. Two
	// genuinely distinct sessions are required (one shared/cloned session can't
	// distinguish global from local revoke). This registers a fresh
	// username+password account per run and signs in twice (once per context),
	// so it needs no shared seed user and no cross-project skip — the unique
	// username keeps concurrent Playwright projects from interfering. The revoke
	// is backend-side and browser-independent (GoTrue invalidating refresh
	// tokens).
	test('sign-out-everywhere revokes a second session', async ({ page, browser }) => {
		const username = uniqueUsername('revoke');
		const password = 'cairn-e2e-pw';

		// Context A — register, creating the account and the first session.
		await register(page, username, password);

		// Context B — a second, independent session for the same user via sign-in.
		const contextB = await browser.newContext();
		const pageB = await contextB.newPage();
		await signInWithPassword(pageB, username, password);

		// From context A, sign out everywhere (revokes ALL of the user's sessions).
		// There is no sign-out-everywhere UI yet, so drive the BFF endpoint
		// directly from A's page (carrying A's cookies + the required CSRF header).
		const status = await page.evaluate(async (header) => {
			const res = await fetch('/auth/signout?scope=global', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { [header]: '1' }
			});
			return res.status;
		}, CSRF_HEADER);
		expect(status).toBe(204);

		// Context B's session is now revoked server-side: a fresh boot refreshes
		// the durable cookie, /auth/refresh 401s (revoked family), and the guard
		// bounces B to sign-in.
		await pageB.goto('/lists');
		await expect(pageB).toHaveURL(/\/auth\/signin$/);

		await contextB.close();
	});

	// (e) Forced re-auth: a cookie planted under the bare pre-2002 name with no
	// access cookie must NOT authenticate. Boot reads the durable cookie, tries
	// to refresh, GoTrue rejects the bogus refresh token, and the user lands
	// signed-out — proving no fallback read of the old artefact authenticates and
	// the non-revocable gap is structurally closed.
	test('a stale pre-2002 cookie does not authenticate', async ({ page, context }) => {
		await context.addCookies([
			{
				name: DURABLE_COOKIE,
				value: 'pre-2002-opaque-session-value',
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				sameSite: 'Lax'
			}
		]);

		await page.goto('/lists');
		await expect(page).toHaveURL(/\/auth\/signin$/);
	});
});

// Username + password sign-in, end to end against the real stack (the BFF
// resolve_username → password-grant-against-<uid>@cairn.internal → dual-cookie
// plant). The load-bearing property is (c): a username change does NOT break
// sign-in, because the GoTrue login handle is the stable uid identity, not the
// username.
test.describe('username + password credential', () => {
	const PASSWORD = 'cairn-e2e-pw';

	// (a) Register happy path: a fresh username+password lands signed-in with
	// both dual-session cookies planted (HttpOnly, SameSite=Lax).
	test('register signs in and plants both cookies', async ({ page, context }) => {
		const username = uniqueUsername('reg');
		await register(page, username, PASSWORD);

		const durable = await cookieNamed(context, DURABLE_COOKIE);
		expect(durable).toBeDefined();
		expect(durable?.httpOnly).toBe(true);
		expect(durable?.sameSite).toBe('Lax');
		const access = await cookieNamed(context, ACCESS_COOKIE);
		expect(access).toBeDefined();
		expect(access?.httpOnly).toBe(true);
		expect(access?.sameSite).toBe('Lax');
	});

	// (b) Sign-in happy path: register, sign out, then sign in again with the
	// same credentials.
	test('sign-in after sign-out signs back in', async ({ page }) => {
		const username = uniqueUsername('signin');
		await register(page, username, PASSWORD);
		await signOut(page);
		await signInWithPassword(page, username, PASSWORD);
	});

	// (c) Rename-then-sign-in: while signed in, change the username, sign out,
	// and sign in with the NEW username + the same password. This is the whole
	// point of the stable identity — the credential survives the rename.
	// There is no rename UI yet, so the rename is driven through the
	// authenticated set_username RPC directly (the same "no UI yet, hit the
	// endpoint" approach the sign-out-everywhere test uses for the BFF).
	test('a username change does not break sign-in', async ({ page }) => {
		const username = uniqueUsername('old');
		const renamed = uniqueUsername('new');
		await register(page, username, PASSWORD);

		// /api is the data plane (cookie→bearer translation, no CSRF header).
		const status = await page.evaluate(async (newName) => {
			const res = await fetch('/api/rpc/set_username', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ p_username: newName })
			});
			return res.status;
		}, renamed);
		expect(status).toBeGreaterThanOrEqual(200);
		expect(status).toBeLessThan(300);

		await signOut(page);

		// The OLD username no longer resolves; the NEW one signs in.
		await signInWithPassword(page, renamed, PASSWORD);
	});

	// (d) Constant-shape failure: a wrong password and an unknown username both
	// show the same inline error and do not sign in.
	test('wrong password and unknown username fail identically', async ({ page }) => {
		const username = uniqueUsername('shape');
		await register(page, username, PASSWORD);
		await signOut(page);

		// Wrong password for a real account.
		await page.goto('/auth/signin');
		await page.locator('[data-test="signin-username"]').fill(username);
		await page.locator('[data-test="signin-password"]').fill('definitely-wrong');
		await page.locator('[data-test="signin-submit"]').click();
		await expect(page.locator('[data-test="signin-error"]')).toBeVisible();
		const wrongPwError = await page.locator('[data-test="signin-error"]').textContent();
		await expect(page).toHaveURL(/\/auth\/signin$/);

		// Unknown username — same inline error, still no sign-in.
		await page.goto('/auth/signin');
		await page.locator('[data-test="signin-username"]').fill(uniqueUsername('nobody'));
		await page.locator('[data-test="signin-password"]').fill(PASSWORD);
		await page.locator('[data-test="signin-submit"]').click();
		await expect(page.locator('[data-test="signin-error"]')).toBeVisible();
		const unknownUserError = await page.locator('[data-test="signin-error"]').textContent();
		await expect(page).toHaveURL(/\/auth\/signin$/);

		// Constant-shape: the two failures are indistinguishable to the caller.
		expect(unknownUserError).toBe(wrongPwError);
	});
});
