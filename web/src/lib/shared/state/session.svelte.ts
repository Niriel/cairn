// `shared/state/` cannot import from `auth/model/` per
// docs/frontend-layout.md, so the URL prefix is read from the same
// VITE_AUTH_BASE env var that pins `auth-client.ts`'s URLs — matching
// contracts via env instead of via import.
export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? '/auth';

export type AuthUser = { id: string; email: string };

export type Session =
	| { status: 'unknown' }
	| { status: 'signed-out' }
	| { status: 'signed-in'; user: AuthUser };

// Boxed under `.current` so TypeScript narrows across `status` → `user`
// reads: after `if (session.current.status === 'signed-in')`, the very
// same `.current` access narrows `.user` to `AuthUser`. A two-getter
// shape (`session.status`, `session.user`) does NOT narrow. Mutators
// MUST replace `.current` wholesale — never split-assign `status` and
// `user` separately, the intermediate state would be impossible.
export const session = $state<{ current: Session }>({
	current: { status: 'unknown' }
});

// Cached so concurrent callers share one in-flight fetch. Cleared in
// the IIFE's `finally`, so a later boot (after `signOut`) can fire
// again. By the time `await bootSession()` returns to the caller, the
// finally has already run and this is null.
let bootPromise: Promise<void> | null = null;

export function bootSession(): Promise<void> {
	if (bootPromise) return bootPromise;
	bootPromise = (async () => {
		try {
			const res = await fetch(`${AUTH_BASE}/user`, { credentials: 'same-origin' });
			if (res.ok) {
				const user = (await res.json()) as AuthUser;
				// Symmetric guard with the failure branch: if a deliberate
				// entrypoint (`setSignedIn`, `signOut`, `onUnauthorized`)
				// fired while this fetch was in flight, it wins.
				if (session.current.status === 'unknown') {
					session.current = { status: 'signed-in', user };
				}
				return;
			}
			if (res.status !== 401) {
				console.error('bootSession: unexpected status from /auth/user', res.status);
			}
			if (session.current.status === 'unknown') {
				session.current = { status: 'signed-out' };
			}
		} catch (err) {
			console.error('bootSession: failed to load /auth/user', err);
			if (session.current.status === 'unknown') {
				session.current = { status: 'signed-out' };
			}
		} finally {
			bootPromise = null;
		}
	})();
	return bootPromise;
}

export async function signOut(): Promise<void> {
	if (session.current.status === 'signed-out') return;
	try {
		await fetch(`${AUTH_BASE}/session`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});
	} catch (err) {
		// Explicit user intent is authoritative — a network failure must
		// not leave the user stuck in `signed-in` with an unhandled
		// rejection. The `finally` below still writes `signed-out`.
		console.error('signOut: DELETE /auth/session failed', err);
	} finally {
		session.current = { status: 'signed-out' };
	}
}

export function setSignedIn(user: AuthUser): void {
	// No-op while already signed-in: the live cookie is the source of
	// truth and there is no path in step 3 that updates the user
	// payload on an existing session (refresh-token rotation is
	// deferred).
	if (session.current.status === 'signed-in') return;
	session.current = { status: 'signed-in', user };
}

export function onUnauthorized(): void {
	if (session.current.status === 'signed-out') return;
	session.current = { status: 'signed-out' };
}
