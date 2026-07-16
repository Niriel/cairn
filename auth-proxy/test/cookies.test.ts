import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
	plantSession,
	clearSession,
	readAccessCookie,
	readSessionCookie,
	sessionCookieName,
	accessCookieName
} from '../src/lib/cookies.js';

// Drive plantSession/clearSession through a throwaway express app so the
// Set-Cookie headers are observed exactly as the browser would receive them.
function appWith(handler: express.RequestHandler) {
	const app = express();
	app.post('/plant', handler);
	return app;
}

function cookieFor(res: request.Response, prefix: string): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith(prefix));
}

// The durable idle horizon both cookies are sized to (~30 days in seconds).
const HORIZON = String(60 * 60 * 24 * 30);

beforeEach(() => {
	delete process.env.COOKIE_SECURE;
});

afterEach(() => {
	delete process.env.COOKIE_SECURE;
});

describe('cookies', () => {
	it('plantSession sets both cookies — durable holds the refresh token, access holds the JWT', async () => {
		const app = appWith((_req, res) => {
			plantSession(res, { accessToken: 'AAA.jwt', refreshToken: 'RRR.refresh', expiresIn: 300 });
			res.status(200).end();
		});
		const res = await request(app).post('/plant');

		const session = cookieFor(res, 'cairn_session=');
		const access = cookieFor(res, 'cairn_access=');
		expect(session).toContain('cairn_session=RRR.refresh');
		expect(access).toContain('cairn_access=AAA.jwt');
	});

	it('plantSession sizes BOTH cookies to the ~30-day idle horizon, not the JWT TTL', async () => {
		// The access cookie deliberately outlives its own JWT so an expired
		// bearer is still sent (PostgREST → 401, not anon-200), letting the
		// refresh-on-401 interceptor fire. So its Max-Age must be the horizon,
		// NOT expiresIn (300).
		const app = appWith((_req, res) => {
			plantSession(res, { accessToken: 'AAA.jwt', refreshToken: 'RRR.refresh', expiresIn: 300 });
			res.status(200).end();
		});
		const res = await request(app).post('/plant');

		const session = cookieFor(res, 'cairn_session=');
		const access = cookieFor(res, 'cairn_access=');
		expect(session).toContain(`Max-Age=${HORIZON}`);
		expect(access).toContain(`Max-Age=${HORIZON}`);
		expect(access).not.toContain('Max-Age=300');
	});

	it('plantSession marks both cookies HttpOnly and SameSite=Lax', async () => {
		const app = appWith((_req, res) => {
			plantSession(res, { accessToken: 'AAA.jwt', refreshToken: 'RRR.refresh' });
			res.status(200).end();
		});
		const res = await request(app).post('/plant');

		for (const prefix of ['cairn_session=', 'cairn_access=']) {
			const cookie = cookieFor(res, prefix);
			expect(cookie).toContain('HttpOnly');
			expect(cookie).toContain('SameSite=Lax');
		}
	});

	it('clearSession clears both cookies with Max-Age=0', async () => {
		const app = appWith((_req, res) => {
			clearSession(res);
			res.status(204).end();
		});
		const res = await request(app).post('/plant');

		expect(cookieFor(res, 'cairn_session=')).toContain('Max-Age=0');
		expect(cookieFor(res, 'cairn_access=')).toContain('Max-Age=0');
	});

	it('readSessionCookie / readAccessCookie pull the right value from a Cookie header', () => {
		const header = 'cairn_session=RRR.refresh; cairn_access=AAA.jwt';
		expect(readSessionCookie(header)).toBe('RRR.refresh');
		expect(readAccessCookie(header)).toBe('AAA.jwt');
		expect(readSessionCookie(undefined)).toBeNull();
		expect(readAccessCookie('')).toBeNull();
	});

	it('cookie-name helpers return the unprefixed names in dev (COOKIE_SECURE unset)', () => {
		// Dev runs plain-HTTP localhost; the __Host- prefix demands Secure, which
		// would never be sent back, so dev keeps the unprefixed names.
		expect(sessionCookieName()).toBe('cairn_session');
		expect(accessCookieName()).toBe('cairn_access');
	});

	it('cookie-name helpers use the __Host- prefix in prod (COOKIE_SECURE === "true")', () => {
		// The helpers read COOKIE_SECURE at call time, so the toggle takes effect.
		process.env.COOKIE_SECURE = 'true';
		expect(sessionCookieName()).toBe('__Host-cairn_session');
		expect(accessCookieName()).toBe('__Host-cairn_access');
	});

	it('plantSession uses the __Host- names in prod and an attribute string that satisfies the prefix rules', async () => {
		// The __Host- prefix requires Secure + Path=/ + no Domain. Assert all
		// three on both planted cookies.
		process.env.COOKIE_SECURE = 'true';
		const app = appWith((_req, res) => {
			plantSession(res, { accessToken: 'AAA.jwt', refreshToken: 'RRR.refresh' });
			res.status(200).end();
		});
		const res = await request(app).post('/plant');

		const session = cookieFor(res, '__Host-cairn_session=');
		const access = cookieFor(res, '__Host-cairn_access=');
		expect(session).toBeDefined();
		expect(access).toBeDefined();
		for (const cookie of [session, access]) {
			expect(cookie).toContain('Secure');
			expect(cookie).toContain('Path=/');
			expect(cookie).not.toContain('Domain');
		}
	});

	it('readSessionCookie / readAccessCookie read the __Host- names in prod', () => {
		process.env.COOKIE_SECURE = 'true';
		const header = '__Host-cairn_session=RRR.refresh; __Host-cairn_access=AAA.jwt';
		expect(readSessionCookie(header)).toBe('RRR.refresh');
		expect(readAccessCookie(header)).toBe('AAA.jwt');
	});
});
