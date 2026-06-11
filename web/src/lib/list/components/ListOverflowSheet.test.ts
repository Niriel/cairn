import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { deleteList } from '$lib/list/state/lists.svelte';
import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/components/ButtonPair.svelte');
vi.mock('$lib/list/state/lists.svelte');
vi.mock('$lib/list/components/RenameListSheet.svelte');
vi.mock('$lib/list/components/EditDescriptionSheet.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/shared/http/postgrest');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

import * as pgMod from '$lib/shared/http/postgrest';
import { setPublic } from '$lib/list/state/lists.svelte';
import { profile } from '$lib/shared/state/profile.svelte';
import { goto } from '$app/navigation';

import ListOverflowSheet from './ListOverflowSheet.svelte';

const ME_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
	profile.uid = ME_UID;
	vi.mocked(pgMod.pgPatch).mockResolvedValue(undefined);
	vi.mocked(setPublic).mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
	vi.clearAllMocks();
});

const PROPS = {
	listId: 'list-1',
	listName: 'Movies for Bob',
	description: 'A great list',
	itemCount: 6,
	memberCount: 2,
	isPublic: false,
	onDelete: vi.fn(),
	onviewtrash: vi.fn(),
	onclose: vi.fn()
};

describe('ListOverflowSheet', () => {
	test('(a) renders list name and meta in header', () => {
		const { container } = render(ListOverflowSheet, PROPS);
		expect(container.textContent).toContain('Movies for Bob');
		expect(container.textContent).toContain('6');
		expect(container.textContent).toContain('2');
	});

	test('(b) shows rows in order with the publish toggle above leave/delete', () => {
		const { container } = render(ListOverflowSheet, PROPS);
		const rows = Array.from(
			container.querySelectorAll<HTMLElement>('[data-test^="list-overflow-"]')
		)
			.map((el) => el.getAttribute('data-test'))
			.filter((t): t is string => t !== null && t !== 'list-overflow-leave-confirm');
		expect(rows).toEqual([
			'list-overflow-rename',
			'list-overflow-edit-description',
			'list-overflow-manage-members',
			'list-overflow-view-trash',
			'list-overflow-toggle-public',
			'list-overflow-leave',
			'list-overflow-delete'
		]);
	});

	test('(c) tapping View bin calls onviewtrash', async () => {
		const onviewtrash = vi.fn();
		const { getByDataTest } = render(ListOverflowSheet, { ...PROPS, onviewtrash });
		await fireEvent.click(getByDataTest('list-overflow-view-trash'));
		expect(onviewtrash).toHaveBeenCalledTimes(1);
	});

	test('(d) tapping Delete list calls deleteList and then onDelete', async () => {
		const onDelete = vi.fn();
		const { getByDataTest } = render(ListOverflowSheet, { ...PROPS, onDelete });
		await fireEvent.click(getByDataTest('list-overflow-delete'));
		await vi.waitFor(() => {
			expect(vi.mocked(deleteList)).toHaveBeenCalledWith('list-1');
			expect(onDelete).toHaveBeenCalledTimes(1);
		});
	});

	test('(e) tapping Rename list renders RenameListSheet', async () => {
		const { getByDataTest, queryByDataTest } = render(ListOverflowSheet, PROPS);
		await fireEvent.click(getByDataTest('list-overflow-rename'));
		expect(queryByDataTest('rename-list-sheet-stub')).not.toBeNull();
	});

	test('(f) tapping Edit description renders EditDescriptionSheet', async () => {
		const { getByDataTest, queryByDataTest } = render(ListOverflowSheet, PROPS);
		await fireEvent.click(getByDataTest('list-overflow-edit-description'));
		expect(queryByDataTest('edit-description-sheet-stub')).not.toBeNull();
	});

	test('(g) Sheet onclose invokes ListOverflowSheet onclose prop', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(ListOverflowSheet, { ...PROPS, onclose });
		await fireEvent.click(getByDataTest('sheet-close'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	test('(h) Manage members navigates to /lists/<id>/members', async () => {
		const { getByDataTest } = render(ListOverflowSheet, PROPS);
		await fireEvent.click(getByDataTest('list-overflow-manage-members'));
		// goManageMembers closes the sheet first then waits for the resulting
		// popstate before navigating (avoids SvelteKit reversing the goto
		// when the Sheet's history-guard back() lands after the forward push).
		// Simulate the popstate so the awaited navigation completes.
		dispatchEvent(new PopStateEvent('popstate', { state: null }));
		await Promise.resolve();
		await Promise.resolve();
		expect(goto).toHaveBeenCalledWith('/lists/list-1/members');
	});

	test('(i) tapping Leave list reveals confirm block', async () => {
		const { getByDataTest, queryByDataTest } = render(ListOverflowSheet, PROPS);
		expect(queryByDataTest('list-overflow-leave-confirm')).toBeNull();
		await fireEvent.click(getByDataTest('list-overflow-leave'));
		expect(queryByDataTest('list-overflow-leave-confirm')).not.toBeNull();
	});

	test('(j) confirm Leave calls pgPatch with ISO deleted_at and navigates to /lists', async () => {
		const { getByDataTest } = render(ListOverflowSheet, PROPS);
		await fireEvent.click(getByDataTest('list-overflow-leave'));
		await fireEvent.click(getByDataTest('list-overflow-leave-confirm'));
		await vi.waitFor(() => {
			expect(vi.mocked(pgMod.pgPatch)).toHaveBeenCalledWith(
				`/list_members?list_id=eq.list-1&user_id=eq.${ME_UID}`,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.stringMatching returns any
				{ deleted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }
			);
			expect(goto).toHaveBeenCalledWith('/lists');
		});
	});

	describe('publish toggle and copy link', () => {
		test('(k) when private: shows "Make public", no copy-link row, and tapping calls setPublic(id, true)', async () => {
			const { getByDataTest, queryByDataTest, container } = render(ListOverflowSheet, {
				...PROPS,
				isPublic: false
			});
			expect(container.textContent).toContain('Make public');
			expect(queryByDataTest('list-overflow-copy-link')).toBeNull();
			await fireEvent.click(getByDataTest('list-overflow-toggle-public'));
			await vi.waitFor(() => {
				expect(vi.mocked(setPublic)).toHaveBeenCalledWith('list-1', true);
			});
		});

		test('(l) when public: shows "Make private" and tapping the toggle calls setPublic(id, false)', async () => {
			const { getByDataTest, container } = render(ListOverflowSheet, { ...PROPS, isPublic: true });
			expect(container.textContent).toContain('Make private');
			await fireEvent.click(getByDataTest('list-overflow-toggle-public'));
			await vi.waitFor(() => {
				expect(vi.mocked(setPublic)).toHaveBeenCalledWith('list-1', false);
			});
		});

		test('(m) when public: copy-link writes <origin>/p/<id> and surfaces "Copied" feedback', async () => {
			const { getByDataTest, container } = render(ListOverflowSheet, { ...PROPS, isPublic: true });
			const copyRow = getByDataTest('list-overflow-copy-link');
			expect(container.textContent).toContain('Copy public link');
			await fireEvent.click(copyRow);
			await vi.waitFor(() => {
				expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/list-1`);
				expect(container.textContent).toContain('Copied');
			});
		});

		test('(n) public-change is reported to the parent after a successful toggle', async () => {
			const onpublicchange = vi.fn();
			const { getByDataTest } = render(ListOverflowSheet, {
				...PROPS,
				isPublic: false,
				onpublicchange
			});
			await fireEvent.click(getByDataTest('list-overflow-toggle-public'));
			await vi.waitFor(() => {
				expect(onpublicchange).toHaveBeenCalledWith(true);
			});
		});
	});
});
