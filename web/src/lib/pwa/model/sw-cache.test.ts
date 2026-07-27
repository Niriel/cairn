import { describe, expect, test } from 'vitest';
import {
	apiCache,
	classifyApiRequest,
	MRU_SENTINEL_KEY,
	shellCache,
	shouldKeepOnPurge,
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
	`${ORIGIN}/api/lists?select=id,name,description,modified_at&list_members.deleted_at=is.null&deleted_at=is.null&lists_is_member=is.true&order=modified_at.desc`
);
const meta = (id: string) =>
	new URL(`${ORIGIN}/api/lists?id=eq.${id}&select=name,description,is_public`);
const items = (id: string) =>
	new URL(`${ORIGIN}/api/items_ranked?list_id=eq.${id}&select=*&order=score.desc,created_at.asc`);
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
