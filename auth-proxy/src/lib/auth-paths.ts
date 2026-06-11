// COPY of the canonical web/src/lib/shared/model/auth-paths.ts.
//
// The production auth-proxy must narrow on the SAME path lists as the web
// app's Vite dev proxy and route guard. Rather than reach across package
// boundaries at build time, we keep a verbatim copy here and guard it with
// `test/auth-paths-drift.test.ts`, which fails if this file and the
// canonical source ever diverge. When you edit the canonical file, copy the
// change here too — the drift guard will tell you if you forget.
//
// The proxy itself only reads BEARER_AUTH_PATHS, COOKIE_PLANT_PATHS, and
// LOGOUT_PATHS, but the copy is verbatim (all exports) so the drift guard
// can compare the whole file.

export const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/check', '/auth/callback'] as const;

export const SIGNED_IN_REDIRECT_PATHS = ['/auth/login', '/auth/check'] as const;

export const BEARER_AUTH_PATHS = ['/auth/user'] as const;

export const COOKIE_PLANT_PATHS = ['/auth/verify', '/auth/token'] as const;

export const LOGOUT_PATHS = ['/auth/session'] as const;

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
