import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { CSRF_HEADER } from '../src/lib/shared/model/auth-paths';
import { waitForMagicLink } from './helpers/mailpit';

// Magic-link happy path + sign-out, end to end against the real backend
// (GoTrue + Mailpit + PostgREST + the Vite cookie-plant proxy). Dev-shortcut
// sign-in is exercised by Vitest component tests; this spec proves the full
// stack works. See plans/0300_auth_http_client/TASKS.md 6.4.

// Dev cookie names (unprefixed — localhost is plain HTTP, so the prod
// `__Host-` prefix is intentionally absent here; see Task 2.1). The durable
// cookie holds the rotating refresh token; the short-lived one holds the
// BFF-minted access JWT the data plane attaches as a bearer.
const DURABLE_COOKIE = 'cairn_session';
const ACCESS_COOKIE = 'cairn_access';

async function cookieNamed(context: BrowserContext, name: string) {
	return (await context.cookies()).find((c) => c.name === name);
}

// Drive the magic-link sign-in end to end and land on /lists.
async function signInViaMagicLink(page: Page, email: string): Promise<void> {
	await page.goto('/');
	await expect(page).toHaveURL(/\/auth\/login$/);
	await page.locator('[data-test="login-email"]').fill(email);
	await page.locator('[data-test="login-submit"]').click();
	await expect(page).toHaveURL(/\/auth\/check$/);
	const { link } = await waitForMagicLink(email);
	await page.goto(link);
	await expect(page).toHaveURL(/\/lists$/);
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

	// The e-mail carries a typeable six-digit code (the code-entry path on
	// /auth/check). It must be present in both MIME parts.
	expect(/\b\d{6}\b/.test(html)).toBe(true);
	expect(/\b\d{6}\b/.test(text)).toBe(true);

	// Playwright follows the GoTrue /verify → 302 → /auth/callback#… chain
	// automatically; the callback page strips the hash and JS-navigates to
	// /, which then redirects to /lists.
	await page.goto(link);
	await expect(page).toHaveURL(/\/lists$/);

	// (a) The dual-cookie contract: BOTH the durable refresh cookie and the
	// short-lived access cookie are planted, HttpOnly + SameSite=Lax. This is the
	// authoritative dev cookie-parity check (Task 2.1 parity-risk note) — it runs
	// against the real stack and catches a Vite proxy that drifted from cookies.ts.
	const durable = await cookieNamed(context, DURABLE_COOKIE);
	expect(durable).toBeDefined();
	expect(durable?.httpOnly).toBe(true);
	expect(durable?.sameSite).toBe('Lax');
	const access = await cookieNamed(context, ACCESS_COOKIE);
	expect(access).toBeDefined();
	expect(access?.httpOnly).toBe(true);
	expect(access?.sameSite).toBe('Lax');

	// (c) Sign-out clears BOTH cookies (server-side revoke + cookie clear)...
	await page.goto('/settings');
	await page.locator('[data-test="signout"]').click();
	await expect(page).toHaveURL(/\/auth\/login$/);
	expect(await cookieNamed(context, DURABLE_COOKIE)).toBeUndefined();
	expect(await cookieNamed(context, ACCESS_COOKIE)).toBeUndefined();

	// ...and the session is genuinely gone: a fresh visit to a protected route
	// boots with no cookies, /auth/refresh 401s, and the guard bounces to login
	// (the data plane now runs as anon). Proves sign-out de-authorises /api, not
	// just the local UI state.
	await page.goto('/lists');
	await expect(page).toHaveURL(/\/auth\/login$/);
});

test('code-entry happy path: typing the e-mailed code signs in', async ({ page, context }) => {
	const email = `alice+${test.info().testId}@example.test`;

	// Reach /auth/check through the request flow, never a direct visit:
	// pendingLogin is a module-scoped singleton wiped on hard reload, and
	// /auth/check redirects to /auth/login when it's empty. Stay in the SPA.
	await page.goto('/');
	await expect(page).toHaveURL(/\/auth\/login$/);

	await page.locator('[data-test="login-email"]').fill(email);
	await page.locator('[data-test="login-submit"]').click();
	await expect(page).toHaveURL(/\/auth\/check$/);

	const { code } = await waitForMagicLink(email);

	// Deliberately do NOT open the link — typing the code is the whole point
	// (the device reading the e-mail differs from the one entering the code).
	// Filling six valid digits edge-triggers auto-submit; the "Sign in" button
	// is only a fallback, so this also proves the auto-submit path.
	await page.locator('[data-test="login-check-code"]').fill(code);

	await expect(page).toHaveURL(/\/lists$/);

	// Same cookie contract the link-click path asserts: /auth/verify plants the
	// HttpOnly cairn_session in the prod-shaped shim.
	const session = (await context.cookies()).find((c) => c.name === 'cairn_session');
	expect(session).toBeDefined();
	expect(session?.httpOnly).toBe(true);
	expect(session?.sameSite).toBe('Lax');
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

// The revocable session's behaviours that the single happy-path can't show:
// silent refresh across access-token expiry, sign-out-everywhere killing a
// second session, and a stale pre-2002 cookie failing to authenticate.
test.describe('revocable session', () => {
	// (b) Silent refresh: when the access cookie's JWT has expired but the durable
	// refresh cookie is still valid, an /api call 401s, the interceptor refreshes
	// once, retries, and the user stays signed in — no bounce to login.
	test('silent refresh on access-token expiry keeps the user signed in', async ({
		page,
		context
	}) => {
		// Unique per run (not the stable testId) so a rapid re-run doesn't trip
		// GoTrue's per-e-mail magic-link send throttle and reuse a consumed link.
		const email = `alice+refresh-${Date.now().toString(36)}@example.test`;
		await signInViaMagicLink(page, email);

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
	// distinguish global from local revoke), and GoTrue throttles a repeat
	// magic-link to the same e-mail (429), so this uses the dev-login password
	// grant for a seed user. That fixes the e-mail to alice@example.test, which is
	// shared across Playwright projects — a concurrent global revoke from another
	// project would interfere — so the scenario runs on a single project. The
	// revoke is backend-side and browser-independent (GoTrue invalidating refresh
	// tokens), so one browser proves it; firefox is the chosen one (Cairn's users
	// are on firefox).
	test('sign-out-everywhere revokes a second session', async ({ page, browser }) => {
		test.skip(
			browser.browserType().name() !== 'firefox',
			'uses the shared seed user alice@example.test; run once to avoid cross-project revoke interference'
		);

		// Context A — first session for alice.
		await page.goto('/');
		await expect(page).toHaveURL(/\/auth\/login$/);
		await page.locator('[data-test="dev-login-alice"]').click();
		await expect(page).toHaveURL(/\/lists$/);

		// Context B — a second, independent session for the same user.
		const contextB = await browser.newContext();
		const pageB = await contextB.newPage();
		await pageB.goto('/');
		await expect(pageB).toHaveURL(/\/auth\/login$/);
		await pageB.locator('[data-test="dev-login-alice"]').click();
		await expect(pageB).toHaveURL(/\/lists$/);

		// From context A, sign out everywhere (revokes ALL of alice's sessions).
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
		// bounces B to login.
		await pageB.goto('/lists');
		await expect(pageB).toHaveURL(/\/auth\/login$/);

		await contextB.close();
	});

	// (e) Forced re-auth (R10): a cookie planted under the bare pre-2002 name with
	// no access cookie must NOT authenticate. Boot reads the durable cookie, tries
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
		await expect(page).toHaveURL(/\/auth\/login$/);
	});
});
