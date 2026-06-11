import { beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import { timeAgo } from '$lib/shared/model/time-ago';

vi.mock('$lib/shared/http/postgrest');

import * as pgMod from '$lib/shared/http/postgrest';

import Page from './+page.svelte';

const ITEM_ADDED = '2020-01-01T00:00:00Z';

const PUBLIC_LIST = {
	id: 'list-1',
	name: 'Best Films',
	description: 'A shared ranking',
	items: [
		{ id: 'i1', name: 'Top Pick', notes: 'a great one', score: 5, created_at: ITEM_ADDED },
		{ id: 'i2', name: 'Runner Up', notes: null, score: 2, created_at: ITEM_ADDED }
	]
};

// SvelteKit passes `params` to +page.svelte as a prop; the page reads list_id
// from it. Cast away the full PageProps shape (data/etc.) the test doesn't need.
const PROPS = { params: { list_id: 'list-1' } } as never;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('/p/[list_id]', () => {
	test('renders the list name, description, and ranked items with scores', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(PUBLIC_LIST);
		const { container, getByDataTest } = render(Page, PROPS);
		await vi.waitFor(() => {
			expect(getByDataTest('public-list')).toBeTruthy();
		});
		expect(container.textContent).toContain('Best Films');
		expect(container.textContent).toContain('A shared ranking');
		const top = getByDataTest('public-item-i1');
		expect(top.textContent).toContain('Top Pick');
		expect(top.textContent).toContain('5');
	});

	test('shows each item’s age via timeAgo', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(PUBLIC_LIST);
		const { getByDataTest } = render(Page, PROPS);
		await vi.waitFor(() => {
			expect(getByDataTest('public-list')).toBeTruthy();
		});
		const added = getByDataTest('public-item-added-i1');
		// The line renders the relative date through timeAgo (an absolute
		// "1 Jan 2020"-style string for a date this old).
		expect(added.textContent).toContain(timeAgo(ITEM_ADDED));
	});

	test('passes the list id to the public_list_view RPC', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(PUBLIC_LIST);
		render(Page, PROPS);
		await vi.waitFor(() => {
			expect(vi.mocked(pgMod.pgPost)).toHaveBeenCalledWith('/rpc/public_list_view', {
				p_id: 'list-1'
			});
		});
	});

	test('exposes no edit affordances (no vote, add, or overflow controls)', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(PUBLIC_LIST);
		const { container, queryByDataTest } = render(Page, PROPS);
		await vi.waitFor(() => {
			expect(queryByDataTest('public-list')).not.toBeNull();
		});
		// The only interactive element is the home link (an <a>), never a button.
		expect(container.querySelectorAll('button').length).toBe(0);
		expect(queryByDataTest('items-fab')).toBeNull();
	});

	test('the Cairn wordmark is a link to the home page (invitation to join)', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(PUBLIC_LIST);
		const { getByDataTest } = render(Page, PROPS);
		await vi.waitFor(() => {
			expect(getByDataTest('public-list')).toBeTruthy();
		});
		const home = getByDataTest('public-home-link');
		expect(home.tagName).toBe('A');
		expect(home.getAttribute('href')).toBe('/');
	});

	test('renders the "list not available" state when the RPC returns null', async () => {
		vi.mocked(pgMod.pgPost).mockResolvedValue(null);
		const { getByDataTest } = render(Page, PROPS);
		await vi.waitFor(() => {
			expect(getByDataTest('public-unavailable')).toBeTruthy();
		});
	});
});
