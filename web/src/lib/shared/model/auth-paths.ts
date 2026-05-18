// Single source of truth for the auth-related URL path lists that have
// to coexist across the Vite dev proxy (web/vite.config.ts), the route
// guard in `+layout.svelte` (Task 4.1), and the dev-only DELETE shim
// (Task 1.5). Editing any of these lists is one file change that
// propagates to every call site, instead of three drive-by edits that
// can silently drift.

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
