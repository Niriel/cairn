// Mirrors the real `auth-client.ts` API as `vi.fn()` spies. Single-
// consumer today (Task 3.2c's `LoginRequest.test.ts`), but the
// per-case overrides on four functions are non-trivial enough that
// lifting the factory out of the test file keeps the per-case
// `vi.mocked(...).mockResolvedValueOnce(...)` calls readable.
//
// The callback test (Task 6.3) deliberately does NOT use this mock —
// it runs the real `exchangeRefreshToken` against MSW handler overrides
// on `/auth/token`, matching `postgrest.test.ts`'s MSW-driven shape.

import { vi } from 'vitest';

import type { AuthUser } from '$lib/shared/state/session.svelte';

const SEED_USER: AuthUser = {
	id: '11111111-1111-1111-1111-111111111111',
	username: 'dev'
};

export const sendMagicLink = vi.fn((_email: string): Promise<void> => Promise.resolve());

export const signIn = vi.fn(
	(_username: string, _password: string): Promise<{ user: AuthUser }> =>
		Promise.resolve({ user: SEED_USER })
);

export const register = vi.fn(
	(_username: string, _password: string): Promise<{ user: AuthUser }> =>
		Promise.resolve({ user: SEED_USER })
);

export const exchangeRefreshToken = vi.fn(
	(_refreshToken: string): Promise<{ user: AuthUser }> => Promise.resolve({ user: SEED_USER })
);

export const devPasswordSignIn = vi.fn(
	(_email: string, _password: string): Promise<{ user: AuthUser }> =>
		Promise.resolve({ user: SEED_USER })
);

export const verifyOtp = vi.fn(
	(_email: string, _token: string): Promise<{ user: AuthUser }> =>
		Promise.resolve({ user: SEED_USER })
);

export const logout = vi.fn((): Promise<void> => Promise.resolve());

export { HttpError } from '../auth-client';
