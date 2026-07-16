// Mirrors the real `auth-client.ts` API as `vi.fn()` spies. Bare
// `vi.mock('$lib/auth/model/auth-client')` in the auth component tests
// (SignIn, Register) auto-loads this file; lifting the spies out of the
// test files keeps the per-case
// `vi.mocked(...).mockResolvedValueOnce(...)` overrides readable.

import { vi } from 'vitest';

import type { AuthUser } from '$lib/shared/state/session.svelte';

const SEED_USER: AuthUser = {
	id: '11111111-1111-1111-1111-111111111111',
	username: 'dev'
};

export const signIn = vi.fn(
	(_username: string, _password: string): Promise<{ user: AuthUser }> =>
		Promise.resolve({ user: SEED_USER })
);

export const register = vi.fn(
	(_username: string, _password: string): Promise<{ user: AuthUser }> =>
		Promise.resolve({ user: SEED_USER })
);

export const logout = vi.fn((): Promise<void> => Promise.resolve());

export { HttpError } from '../auth-client';
