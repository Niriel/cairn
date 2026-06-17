// Single source of truth for the auth constants that must stay byte-identical
// across the web↔proxy boundary: the auth-related URL path lists and the CSRF
// header name. They coexist across the Vite dev proxy (web/vite.config.ts), the
// route guard in `+layout.svelte` (Task 4.1), the web auth client, and the
// production BFF (auth-proxy/src/lib/auth-paths.ts, a verbatim copy guarded by
// auth-proxy/test/auth-paths-drift.test.ts). Editing any of these is one file
// change that propagates to every call site, instead of drive-by edits that
// can silently drift.

export const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/check', '/auth/callback'] as const;

export const SIGNED_IN_REDIRECT_PATHS = ['/auth/login', '/auth/check'] as const;

export const BEARER_AUTH_PATHS = ['/auth/user'] as const;

export const COOKIE_PLANT_PATHS = ['/auth/verify', '/auth/token'] as const;

export const LOGOUT_PATHS = ['/auth/signout'] as const;

// Required custom header on state-changing Cairn-shaped /auth/* requests. A
// cross-origin attacker cannot set a custom header without a preflight the BFF
// won't grant, so its presence is a CSRF defence on top of SameSite=Lax.
export const CSRF_HEADER = 'X-Cairn-Auth';

export function isSegmentMatch(url: string | undefined, paths: readonly string[]): boolean {
	if (url === undefined) return false;
	const qIdx = url.indexOf('?');
	const path = qIdx === -1 ? url : url.slice(0, qIdx);
	for (const p of paths) {
		if (path === p) return true;
		if (path.startsWith(p + '/')) return true;
	}
	return false;
}
