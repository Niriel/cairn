// Mirrors the real `session.svelte.ts` API as a controllable stand-in.
//
// This mock IS a `$state` proxy (not a plain object) because
// `pending-login.svelte.ts` registers a module-scoped `$effect.root`
// that reads `session.current.status` through this very import — if it
// were a plain object the effect would never re-fire on a consumer
// test's reassignment and the auto-clear behaviour (R14) could not be
// tested through the mock. The sibling `preferences.svelte.ts` mock is
// a plain object on purpose; do not copy that shape forward here.

import { vi } from 'vitest';

import type { AuthUser, Session } from '../session.svelte';

export type { AuthUser, Session };

export const session = $state<{ current: Session }>({
	current: { status: 'unknown' }
});

export const bootSession = vi.fn((): Promise<void> => Promise.resolve());

export const signOut = vi.fn((): Promise<void> => {
	session.current = { status: 'signed-out' };
	return Promise.resolve();
});

export const setSignedIn = vi.fn((user: AuthUser): void => {
	session.current = { status: 'signed-in', user };
});

export const onUnauthorized = vi.fn((): void => {
	session.current = { status: 'signed-out' };
});
