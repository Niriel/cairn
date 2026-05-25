import { describe, it, vi } from 'vitest';
import { expect } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { app } from '../src/index.js';

vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    metadata: vi.fn().mockResolvedValue({ width: 5000, height: 5000 }),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.alloc(100)),
  }),
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

describe('POST /avatars security gates', () => {
  describe('wrong magic bytes', () => {
    it('returns 415', async () => {
      const token = await validToken();
      const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const res = await request(app)
        .post('/avatars')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buf, { filename: 'test.bin', contentType: 'application/octet-stream' });
      expect(res.status).toBe(415);
    });
  });

  describe('image bomb', () => {
    it('returns 422 for oversized dimensions', async () => {
      const token = await validToken();
      // Valid JPEG magic bytes so checkMagicBytes passes; sharp mock returns 5000×5000
      const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
      const res = await request(app)
        .post('/avatars')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buf, { filename: 'test.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(422);
    });
  });

  describe('body > 8 MB', () => {
    it('returns 413', async () => {
      const token = await validToken();
      const buf = Buffer.alloc(9 * 1024 * 1024);
      const res = await request(app)
        .post('/avatars')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buf, { filename: 'test.bin', contentType: 'application/octet-stream' });
      expect(res.status).toBe(413);
    });
  });
});
