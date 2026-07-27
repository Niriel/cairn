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
