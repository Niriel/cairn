import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

describe('GET /healthz', () => {
	it('returns 200 and { ok: true }', async () => {
		const res = await request(app).get('/healthz');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
	});
});
