// Pure classification + purge helpers for the service worker's /api router.
// A worker can't be mounted in happy-dom, so all the decision logic lives here
// where it's unit-testable; service-worker.ts wires it to the Cache API.
//
// No Svelte/runes — this module is imported by the worker (which has no DOM)
// and by its Vitest suite.

import { API_CACHE_PREFIX, SHELL_CACHE_PREFIX } from '$lib/shared/model/cache-names';

/** The verdict for one `/api` request URL. */
export type ApiClass =
	| 'overview'
	| { kind: 'list-scoped'; listId: string | null; isEntry?: boolean }
	| null;

/** Versioned shell-cache name, e.g. `cairn-shell-<build>`. */
export const shellCache = (version: string): string => `${SHELL_CACHE_PREFIX}${version}`;
/** Versioned api-cache name, e.g. `cairn-api-<build>`. */
export const apiCache = (version: string): string => `${API_CACHE_PREFIX}${version}`;

// The most-recently-viewed list id is stored as a synthetic Response at this
// key inside the api cache, so the "which list is current" epoch survives SW
// restarts. Chosen to never collide with a real PostgREST path.
export const MRU_SENTINEL_KEY = '/__cairn_mru';

/** Read a PostgREST `<name>=eq.<value>` filter, returning `<value>` or null. */
function eqParam(url: URL, name: string): string | null {
	const v = url.searchParams.get(name);
	return v?.startsWith('eq.') ? v.slice('eq.'.length) : null;
}

/**
 * Classify an `/api` request for the SWR router. Everything outside `/api`
 * (and any `/api` path we don't cache) is `null` — the router passes those
 * through to the network untouched.
 */
export function classifyApiRequest(url: URL): ApiClass {
	switch (url.pathname) {
		case '/api/lists': {
			// The overview GET carries no `id` filter; a list-meta GET does.
			const id = eqParam(url, 'id');
			return id === null ? 'overview' : { kind: 'list-scoped', listId: id };
		}
		case '/api/items_ranked':
			// fetchItems issues this first, so it's the reliable "entering a list"
			// marker that drives the epoch purge.
			return { kind: 'list-scoped', listId: eqParam(url, 'list_id'), isEntry: true };
		case '/api/votes':
			// Belongs to whatever list is current; the URL carries no listId.
			return { kind: 'list-scoped', listId: null };
		default:
			return null;
	}
}

/**
 * True when a list-entry marker for `listId` arrives that differs from the
 * stored MRU epoch — i.e. the user has switched lists, so the previous list's
 * cached rows should be purged. A null epoch (first entry) also purges (a
 * no-op against an empty cache).
 */
export function shouldPurgeForEntry(storedEpoch: string | null, listId: string): boolean {
	return storedEpoch !== listId;
}

/**
 * Purge predicate: given a cached api entry `url` and the `incomingListId`
 * being entered, decide whether to KEEP it. Preserved:
 *   - the lists overview (user-wide, list-independent),
 *   - the MRU sentinel,
 *   - any entry already attributed to the incoming list (its meta or items) —
 *     this keeps a `lists?id=eq.<incomingListId>` meta response that raced
 *     ahead of the `items_ranked` entry marker, so the list name/description
 *     still renders offline.
 * Deleted: unattributable entries (`/api/votes`, which has no listId) and the
 * prior list's rows.
 */
export function shouldKeepOnPurge(url: URL, incomingListId: string): boolean {
	if (url.pathname === MRU_SENTINEL_KEY) return true;
	const c = classifyApiRequest(url);
	if (c === 'overview') return true;
	if (c === null) return false;
	return c.listId !== null && c.listId === incomingListId;
}

/**
 * True for a write against PostgREST — any non-GET under `/api`. Deliberately
 * broader than `classifyApiRequest`, which only knows the paths worth caching:
 * `POST /api/rpc/create_list` is unclassifiable yet changes the overview, so
 * the router keys cache invalidation off the write, not off the read shape.
 */
export function isApiWrite(method: string, url: URL): boolean {
	return method !== 'GET' && url.pathname.startsWith('/api/');
}

/**
 * True for a cached entry that a landed write should mark stale — every cached
 * read, and nothing else. A write is the one moment the cached reads are known
 * to be behind the server, and one write can move rows the URL never mentions:
 * an item changes the ranking, a vote changes the score, a rename changes the
 * overview. Mapping each write to the reads it invalidates would rot with the
 * next endpoint, so the whole set is marked. The MRU sentinel is epoch
 * bookkeeping rather than a cached read, and is left alone.
 */
export function shouldMarkStaleOnWrite(url: URL): boolean {
	return url.pathname !== MRU_SENTINEL_KEY;
}

/**
 * The router's answer when a read can be served neither from the network nor
 * from the cache. Shaped like a PostgREST error so `postgrest.ts` throws a
 * typed `ApiError` rather than rejecting raw — including a `message`, which is
 * load-bearing: without it the error's message falls back to a synthetic
 * Response's empty `statusText`, and the stores that keep the message and test
 * it (`if (items.error)`) read the empty string as no failure at all, showing
 * "Nothing here yet" for a list they simply couldn't reach.
 */
export function offlineResponse(): Response {
	return new Response(JSON.stringify({ code: 'offline', message: 'No connection' }), {
		status: 503,
		headers: { 'content-type': 'application/json' }
	});
}

// A cached response carries this header once a write has landed behind its
// back. It means "still good enough to show offline, but confirm with the
// server before showing it again" — the router turns SWR into network-first
// (cache as fallback) for exactly these entries, so the read that follows a
// write can't be served the pre-write answer. Marking rather than deleting is
// what keeps offline reads working: the app refetches only what the screen it
// is on needs, so a delete would drop the lists overview and the list's own
// name — content nothing would ever put back — for the sake of freshness the
// next read obtains anyway.
const STALE_HEADER = 'x-cairn-stale';

/** True once a write has landed since this response was cached. */
export function isStale(response: Response): boolean {
	return response.headers.has(STALE_HEADER);
}

/** The same response, flagged for a network-first confirmation. Idempotent. */
export function markStale(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set(STALE_HEADER, '1');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
