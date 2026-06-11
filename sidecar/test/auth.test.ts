import { describe, it } from 'vitest';
import { expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { requireAuth } from '../src/middleware/auth.js';

const SECRET = new TextEncoder().encode('test-secret-at-least-32-characters-long');
const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeApp() {
	const app = express();
	app.get('/test', requireAuth, (_req, res) => res.status(200).json({ ok: true }));
	return app;
}

async function signToken(sub: string, opts: { expiredAt?: number; secret?: Uint8Array } = {}) {
	const now = Math.floor(Date.now() / 1000);
	const iat = opts.expiredAt ?? now;
	const exp = opts.expiredAt ? opts.expiredAt + 3600 - 7200 : now + 3600;
	return new SignJWT({ sub })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt(iat)
		.setExpirationTime(exp)
		.sign(opts.secret ?? SECRET);
}

describe('requireAuth', () => {
	it('no header → 401', async () => {
		const res = await request(makeApp()).get('/test');
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('expired token → 401', async () => {
		// issued 2 hours ago, 1-hour exp → expired 1 hour ago
		const twoHoursAgo = Math.floor(Date.now() / 1000) - 7200;
		const token = await new SignJWT({ sub: VALID_UUID })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt(twoHoursAgo)
			.setExpirationTime(twoHoursAgo + 3600)
			.sign(SECRET);
		const res = await request(makeApp()).get('/test').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(401);
	});

	it('wrong secret → 401', async () => {
		const wrongSecret = new TextEncoder().encode('wrong-secret-at-least-32-characters-long');
		const token = await signToken(VALID_UUID, { secret: wrongSecret });
		const res = await request(makeApp()).get('/test').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(401);
	});

	it('valid token but sub is not a UUID → 400', async () => {
		const token = await signToken('not-a-uuid');
		const res = await request(makeApp()).get('/test').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid uid' });
	});

	it('valid token with UUID sub → 200', async () => {
		const token = await signToken(VALID_UUID);
		const res = await request(makeApp()).get('/test').set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(200);
	});
});
