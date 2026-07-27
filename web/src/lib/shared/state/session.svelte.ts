// `shared/state/` cannot import from `auth/model/` per
// docs/frontend-layout.md, so the URL prefix is read from the same
// VITE_AUTH_BASE env var that pins `auth-client.ts`'s URLs — matching
// contracts via env instead of via import. `auth-paths` lives in
// `shared/model/`, so importing CSRF_HEADER from it is within-tier and
// allowed (the one shared home for the constant, byte-identical with the BFF).
import { API_CACHE_PREFIX } from '$lib/shared/model/cache-names';
import { CSRF_HEADER } from '$lib/shared/model/auth-paths';

export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? '/auth';

// Device-side record of the last-known signed-in user. Both fields are
// non-private (username is public; id is the caller's own uid) — never persist
// an e-mail or any docs/invites.md-protected field here. Read on a cold offline
// boot so a signed-in user isn't pinned on the boot screen (see bootSession).
const USER_KEY = 'cairn.user';

export type AuthUser = { id: string; username: string };

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

// The outcome of a refresh attempt. Three-way, mirroring the BFF's
// /auth/refresh contract (Task 1.3): `ok` adopts the user, `revoked` is
// an authoritative sign-out, `transient` is a momentary upstream blip
// (503 / network / malformed body) that MUST NOT sign the user out.
export type RefreshResult =
	| { status: 'ok'; user: AuthUser }
	| { status: 'revoked' }
	| { status: 'transient' };

// The BFF returns a tokenless `user` on success; today's boot did an
// unvalidated `as AuthUser` cast, which would set a half-populated session
// from a malformed body. `auth/model`'s `assertAuthUser` can't be imported
// here (one-way tier rule), so this is the local guard.
function isAuthUser(value: unknown): value is AuthUser {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as { id?: unknown }).id === 'string' &&
		typeof (value as { username?: unknown }).username === 'string'
	);
}

// `cairn.user` persistence. All localStorage access is try/catch-guarded (as
// app.html's boot script is): a private-mode or disabled-storage failure must
// never bounce or crash the session.
function persistUser(user: AuthUser): void {
	try {
		localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, username: user.username }));
	} catch {
		// storage unavailable / full — non-fatal, the session still works online
	}
}

function clearPersistedUser(): void {
	try {
		localStorage.removeItem(USER_KEY);
	} catch {
		// non-fatal
	}
}

function readPersistedUser(): AuthUser | null {
	try {
		const raw = localStorage.getItem(USER_KEY);
		if (raw === null) return null;
		const parsed: unknown = JSON.parse(raw);
		return isAuthUser(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

// Best-effort purge of the SW api-cache buckets so the next account on this
// device is never served the previous one's cached data (the overview URL is
// byte-identical across accounts). The shell cache is user-independent and left
// intact. `caches` is reachable from the window, so no SW postMessage is
// needed; a failure must not block sign-out.
async function purgeApiCaches(): Promise<void> {
	try {
		if (!('caches' in globalThis)) return;
		const keys = await caches.keys();
		await Promise.all(
			keys.filter((k) => k.startsWith(API_CACHE_PREFIX)).map((k) => caches.delete(k))
		);
	} catch {
		// best-effort
	}
}

// Single shared in-flight refresh. With rotation + reuse detection, two
// concurrent refreshes would replay a rotated token and could trip a
// spurious family-revoke; deduping behind one promise prevents that
// *within this JS realm*. Cross-realm (multi-tab) concurrency is covered
// only by GoTrue's reuse interval (Task 1.2), not by this. Cleared in the
// `finally` so a later refresh can fire again.
let refreshPromise: Promise<RefreshResult> | null = null;

export function refresh(): Promise<RefreshResult> {
	if (refreshPromise) return refreshPromise;
	refreshPromise = (async (): Promise<RefreshResult> => {
		try {
			const res = await fetch(`${AUTH_BASE}/refresh`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { [CSRF_HEADER]: '1' }
			});
			if (res.ok) {
				const body = (await res.json().catch(() => null)) as { user?: unknown } | null;
				if (isAuthUser(body?.user)) {
					return { status: 'ok', user: body.user };
				}
				// A 2xx with a malformed body is a contract break, not a
				// revocation — treat it as transient so a single bad response
				// doesn't bounce a valid session to sign-in.
				console.error('refresh: malformed user payload from /auth/refresh');
				return { status: 'transient' };
			}
			// Only an authoritative 401 is a sign-out. The BFF returns 503 on a
			// transient upstream blip; any other non-401 is treated the same way.
			if (res.status === 401) {
				return { status: 'revoked' };
			}
			return { status: 'transient' };
		} catch (err) {
			console.error('refresh: POST /auth/refresh failed', err);
			return { status: 'transient' };
		} finally {
			refreshPromise = null;
		}
	})();
	return refreshPromise;
}

// Cached so concurrent callers share one in-flight boot. Cleared in the
// IIFE's `finally`, so a later boot (after `signOut`) can fire again. By
// the time `await bootSession()` returns to the caller, the finally has
// already run and this is null.
let bootPromise: Promise<void> | null = null;

export function bootSession(): Promise<void> {
	if (bootPromise) return bootPromise;
	bootPromise = (async () => {
		try {
			// Refresh-then-check: the short-lived access cookie may be expired
			// while the durable refresh cookie is still valid, so boot exchanges
			// the refresh token and adopts the returned user directly — no
			// separate /auth/user round-trip.
			const result = await refresh();
			// Symmetric guard with `setSignedIn`/`signOut`/`onUnauthorized`: if a
			// deliberate entrypoint fired while refresh was in flight, it wins.
			if (session.current.status !== 'unknown') return;
			if (result.status === 'ok') {
				// Account-switch guard: if a different user was last persisted on
				// this device, purge the previous account's api cache before adopting,
				// so its cached data is never shown to the new account.
				const persisted = readPersistedUser();
				if (persisted && persisted.id !== result.user.id) {
					await purgeApiCaches();
					// A deliberate entrypoint may have fired during the purge await.
					if (session.current.status !== 'unknown') return;
				}
				session.current = { status: 'signed-in', user: result.user };
				persistUser(result.user);
			} else if (result.status === 'revoked') {
				session.current = { status: 'signed-out' };
				// Clear any stale persisted user so a later offline boot can't
				// optimistically resurrect this now-revoked session.
				clearPersistedUser();
			} else {
				// `transient` while online leaves the status `unknown`: a momentary
				// outage on cold start must not bounce a validly-signed-in user to
				// sign-in, and an online blip must never optimistically adopt — the
				// retry that resolves it is moments away.
				//
				// Offline there is no such retry, so the boot must settle on the local
				// record rather than pin the visitor on the boot screen forever: a
				// valid last-known user is adopted optimistically so cached content
				// renders, and with none (never signed in here, or storage cleared or
				// unavailable) there is no session to resurrect and no way to check for
				// one — signed-out, so the sign-in screen shows instead of a splash
				// that can never resolve.
				const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
				const persisted = readPersistedUser();
				if (offline) {
					session.current = persisted
						? { status: 'signed-in', user: persisted }
						: { status: 'signed-out' };
				}
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
		await fetch(`${AUTH_BASE}/signout`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { [CSRF_HEADER]: '1' }
		});
	} catch (err) {
		// Explicit user intent is authoritative — a network failure must
		// not leave the user stuck in `signed-in` with an unhandled
		// rejection. The `finally` below still writes `signed-out`.
		console.error('signOut: POST /auth/signout failed', err);
	} finally {
		session.current = { status: 'signed-out' };
		clearPersistedUser();
		await purgeApiCaches();
	}
}

export function setSignedIn(user: AuthUser): void {
	// No-op while already signed-in: the live cookie is the source of
	// truth and there is no path in step 3 that updates the user
	// payload on an existing session (refresh-token rotation is
	// deferred).
	if (session.current.status === 'signed-in') return;
	session.current = { status: 'signed-in', user };
	persistUser(user);
}

export function onUnauthorized(): void {
	if (session.current.status === 'signed-out') return;
	session.current = { status: 'signed-out' };
	clearPersistedUser();
	// Best-effort, fire-and-forget: onUnauthorized is synchronous (a 401
	// handler calls it) and the cache purge must not block the sign-out
	// transition. `void` marks the floating promise intentional.
	void purgeApiCaches();
}
