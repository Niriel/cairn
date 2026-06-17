import { refresh } from '$lib/shared/state/session.svelte';

// Bearer-authenticated raw write (avatar upload/delete) with the same
// silent-refresh recovery the `/api` wrapper (postgrest.ts) has. Avatar writes
// go through Caddy's cookie→bearer translation, not the PostgREST wrapper, so
// without this they would 401 once the short-lived access cookie's JWT expires
// — an upload failing unexplained after an idle period.
//
// On a 401 it refreshes once via the shared single-flight `refresh()` (a burst
// of concurrent 401s collapses to one /auth/refresh) and retries once. It does
// NOT itself flip the session to signed-out: it's a transport helper that
// returns the Response for the caller to handle; the next `/api` call drives
// the sign-out if the session is truly gone. Pass a string/URL (not a Request)
// so the retry can re-issue the body — a Request's body is single-use.
export async function bearerWrite(input: string | URL, init?: RequestInit): Promise<Response> {
	const res = await fetch(input, { credentials: 'same-origin', ...init });
	if (res.status !== 401) return res;

	const result = await refresh();
	if (result.status !== 'ok') return res;

	return fetch(input, { credentials: 'same-origin', ...init });
}
