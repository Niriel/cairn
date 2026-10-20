import { describe, expect, test } from 'vitest';
import {
	apiCache,
	classifyApiRequest,
	isApiWrite,
	isStale,
	markStale,
	offlineResponse,
	MRU_SENTINEL_KEY,
	servesShell,
	shellCache,
	shouldKeepOnPurge,
	shouldMarkStaleOnWrite,
	shouldPurgeForEntry
} from './sw-cache';

const ORIGIN = 'https://cairn.example';
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

// Real request shapes, copied from the callers they model:
//   overview  -> list/state/lists.svelte.ts
//   meta      -> item/components/ItemsScreen.svelte (reloadMeta) & item/model/item-trash.ts
//   items     -> item/model/item.ts (fetchItems, first request = the entry marker)
//   votes     -> item/model/item.ts (fetchItems, second request; no list_id)
const overview = new URL(
	`${ORIGIN}/api/lists?select=id,name,description,modified_at&list_members.deleted_at=is.null&deleted_at=is.null&lists_is_member=is.true&order=name.asc,id.asc`
);
const meta = (id: string) =>
	new URL(`${ORIGIN}/api/lists?id=eq.${id}&select=name,description,is_public`);
const items = (id: string) =>
	new URL(`${ORIGIN}/api/items_ranked?list_id=eq.${id}&select=*&order=name.asc,created_at.asc`);
const votes = new URL(`${ORIGIN}/api/votes?item_id=in.(a,b)&select=item_id,user_id,value`);
const sentinel = new URL(MRU_SENTINEL_KEY, ORIGIN);

describe('classifyApiRequest', () => {
	test('lists without an id is the overview', () => {
		expect(classifyApiRequest(overview)).toBe('overview');
	});

	test('lists with id=eq is list-scoped meta', () => {
		expect(classifyApiRequest(meta(A))).toEqual({ kind: 'list-scoped', listId: A });
	});

	test('items_ranked is the list-entry marker', () => {
		expect(classifyApiRequest(items(A))).toEqual({ kind: 'list-scoped', listId: A, isEntry: true });
	});

	test('votes is list-scoped with no listId of its own', () => {
		expect(classifyApiRequest(votes)).toEqual({ kind: 'list-scoped', listId: null });
	});

	test('other /api paths and non-/api are unclassified', () => {
		expect(classifyApiRequest(new URL(`${ORIGIN}/api/profiles?id=eq.${A}`))).toBeNull();
		expect(classifyApiRequest(new URL(`${ORIGIN}/avatars/${A}.webp`))).toBeNull();
		expect(classifyApiRequest(new URL(`${ORIGIN}/_app/immutable/x.js`))).toBeNull();
	});
});

describe('cache-name builders', () => {
	test('are versioned with the shared prefixes', () => {
		expect(shellCache('abc')).toBe('cairn-shell-abc');
		expect(apiCache('abc')).toBe('cairn-api-abc');
	});
});

describe('shouldPurgeForEntry', () => {
	test('a different listId than the stored epoch triggers a purge', () => {
		expect(shouldPurgeForEntry(A, B)).toBe(true);
	});
	test('the same listId does not', () => {
		expect(shouldPurgeForEntry(A, A)).toBe(false);
	});
	test('no stored epoch (first entry) triggers a purge', () => {
		expect(shouldPurgeForEntry(null, A)).toBe(true);
	});
});

describe('shouldKeepOnPurge (entering list B)', () => {
	test('keeps the overview', () => {
		expect(shouldKeepOnPurge(overview, B)).toBe(true);
	});
	test('keeps the MRU sentinel', () => {
		expect(shouldKeepOnPurge(sentinel, B)).toBe(true);
	});
	test('keeps entries carrying the incoming listId (a raced-ahead meta survives)', () => {
		expect(shouldKeepOnPurge(meta(B), B)).toBe(true);
		expect(shouldKeepOnPurge(items(B), B)).toBe(true);
	});
	test('deletes votes (unattributable) and the prior list entries', () => {
		expect(shouldKeepOnPurge(votes, B)).toBe(false);
		expect(shouldKeepOnPurge(meta(A), B)).toBe(false);
		expect(shouldKeepOnPurge(items(A), B)).toBe(false);
	});
});

describe('servesShell', () => {
	test('app routes get the shell', () => {
		for (const path of ['/', '/lists', `/lists/${A}`, `/lists/${A}/trash`, '/about/open-source']) {
			expect(servesShell(new URL(path, ORIGIN))).toBe(true);
		}
	});

	test('a query string does not make an app route a file', () => {
		expect(servesShell(new URL('/auth/reset-password?code=a.b', ORIGIN))).toBe(true);
	});

	test('static files go to the network', () => {
		expect(servesShell(new URL('/legal/licenses.txt', ORIGIN))).toBe(false);
		expect(servesShell(new URL(`/avatars/${A}.webp?v=3`, ORIGIN))).toBe(false);
	});
});

describe('isApiWrite', () => {
	test('true for a non-GET to any /api path, cached or not', () => {
		// `rpc/create_list` is deliberately included: classifyApiRequest returns
		// null for it (nothing to cache), but it still changes the overview.
		expect(isApiWrite('POST', new URL(`${ORIGIN}/api/rpc/create_list`))).toBe(true);
		expect(isApiWrite('POST', new URL(`${ORIGIN}/api/items`))).toBe(true);
		expect(isApiWrite('PATCH', new URL(`${ORIGIN}/api/lists?id=eq.${A}`))).toBe(true);
		expect(isApiWrite('DELETE', new URL(`${ORIGIN}/api/votes?item_id=eq.x`))).toBe(true);
	});

	test('false for GETs — those are the SWR reads, not writes', () => {
		expect(isApiWrite('GET', overview)).toBe(false);
		expect(isApiWrite('GET', items(A))).toBe(false);
	});

	test('false outside /api — the auth BFF owns its own cookies and caching', () => {
		expect(isApiWrite('POST', new URL(`${ORIGIN}/auth/signin`))).toBe(false);
		expect(isApiWrite('POST', new URL(`${ORIGIN}/apifoo`))).toBe(false);
	});
});

describe('shouldMarkStaleOnWrite', () => {
	test('marks every cached read — one write can move rows the URL never mentions', () => {
		expect(shouldMarkStaleOnWrite(overview)).toBe(true);
		expect(shouldMarkStaleOnWrite(meta(A))).toBe(true);
		expect(shouldMarkStaleOnWrite(items(A))).toBe(true);
		expect(shouldMarkStaleOnWrite(votes)).toBe(true);
	});

	test('leaves the MRU sentinel alone — epoch bookkeeping, not a cached read', () => {
		expect(shouldMarkStaleOnWrite(sentinel)).toBe(false);
	});
});

describe('offlineResponse', () => {
	test('is a 503 carrying a code AND a message', async () => {
		const res = offlineResponse();
		expect(res.status).toBe(503);
		expect(res.headers.get('content-type')).toContain('application/json');
		// The message is load-bearing: postgrest.ts puts it on the thrown
		// ApiError, and the stores test that string for truthiness to decide
		// whether the fetch failed at all.
		const body = (await res.json()) as { code?: string; message?: string };
		expect(body.code).toBe('offline');
		expect(body.message).toBeTruthy();
	});
});

describe('the stale mark', () => {
	test('markStale carries the body and status through, flagged', async () => {
		const marked = markStale(new Response('[{"id":"a"}]', { status: 200 }));
		expect(isStale(marked)).toBe(true);
		expect(marked.status).toBe(200);
		expect(await marked.text()).toBe('[{"id":"a"}]');
	});

	test('a response straight off the network is not stale', () => {
		expect(isStale(new Response('[]', { status: 200 }))).toBe(false);
	});

	test('marking twice is idempotent, so repeated writes cannot compound', () => {
		expect(isStale(markStale(markStale(new Response('[]'))))).toBe(true);
	});
});
