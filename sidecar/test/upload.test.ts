import { describe, it, vi } from 'vitest';
import { expect } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { app } from '../src/index.js';

vi.mock('sharp', () => ({
	default: vi.fn().mockReturnValue({
		metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
		resize: vi.fn().mockReturnThis(),
		webp: vi.fn().mockReturnThis(),
		toBuffer: vi.fn().mockResolvedValue(Buffer.alloc(100))
	})
}));

vi.mock('node:fs/promises', () => ({
	rename: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	unlink: vi.fn().mockResolvedValue(undefined)
}));

const SECRET = new TextEncoder().encode('test-secret-at-least-32-characters-long');
const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function validToken() {
	return new SignJWT({ sub: VALID_UUID })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(SECRET);
}

// Valid JPEG magic bytes
const JPEG_BUF = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);

describe('POST /avatars', () => {
	describe('success path', () => {
		it('returns 200 with version and url', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(1, { status: 200 }));
			const token = await validToken();
			const res = await request(app)
				.post('/avatars')
				.set('Authorization', `Bearer ${token}`)
				.attach('file', JPEG_BUF, { filename: 'test.jpg', contentType: 'image/jpeg' });
			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				version: 1,
				url: `/avatars/${VALID_UUID}.webp?v=1`
			});
		});
	});

	describe('PostgREST failure', () => {
		it('returns 502', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('Internal Server Error', { status: 500 })
			);
			const token = await validToken();
			const res = await request(app)
				.post('/avatars')
				.set('Authorization', `Bearer ${token}`)
				.attach('file', JPEG_BUF, { filename: 'test.jpg', contentType: 'image/jpeg' });
			expect(res.status).toBe(502);
			expect(res.body).toEqual({ error: 'version bump failed' });
		});
	});

	describe('missing file field', () => {
		it('returns 400', async () => {
			const token = await validToken();
			const res = await request(app)
				.post('/avatars')
				.set('Authorization', `Bearer ${token}`)
				.field('other', 'value');
			expect(res.status).toBe(400);
		});
	});
});
