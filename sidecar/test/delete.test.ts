import { describe, it, vi } from 'vitest';
import { expect } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { app } from '../src/index.js';

vi.mock('node:fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
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

describe('DELETE /avatars/me', () => {
  describe('file exists', () => {
    it('returns 200', async () => {
      const { unlink } = await import('node:fs/promises');
      vi.mocked(unlink).mockResolvedValue(undefined);
      const token = await validToken();
      const res = await request(app)
        .delete('/avatars/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('file does not exist', () => {
    it('returns 200 (ENOENT swallowed)', async () => {
      const { unlink } = await import('node:fs/promises');
      vi.mocked(unlink).mockRejectedValue(
        Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
      );
      const token = await validToken();
      const res = await request(app)
        .delete('/avatars/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });
});
