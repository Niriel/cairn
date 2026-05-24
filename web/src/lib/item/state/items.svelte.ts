import { session } from '$lib/shared/state/session.svelte';
import {
	fetchItems,
	addItem as apiAddItem,
	editItem as apiEditItem,
	softDeleteItem as apiSoftDelete,
	restoreItem as apiRestore,
	upsertVote as apiUpsertVote,
	deleteVote as apiDeleteVote
} from '$lib/item/model/item';
import type { Item } from '$lib/item/model/item';

export const items = $state<{
	rows: Item[];
	loading: boolean;
	error: string | null;
	listId: string | null;
	pendingDelete: { item: Item; timerId: ReturnType<typeof setTimeout> } | null;
}>({ rows: [], loading: false, error: null, listId: null, pendingDelete: null });

export async function loadItems(listId: string): Promise<void> {
	const s = session.current;
	if (s.status !== 'signed-in') return;
	items.loading = true;
	items.error = null;
	try {
		items.rows = await fetchItems(listId, s.user.id);
		items.listId = listId;
	} catch (err) {
		items.error = err instanceof Error ? err.message : 'Failed to load items';
	} finally {
		items.loading = false;
	}
}

export async function upsertVote(itemId: string, value: number): Promise<void> {
	const idx = items.rows.findIndex((r) => r.id === itemId);
	if (idx === -1) return;
	const old = { my_vote: items.rows[idx].my_vote, score: items.rows[idx].score };
	items.rows[idx].my_vote = value;
	items.rows[idx].score = old.score + value - (old.my_vote ?? 0);
	try {
		await apiUpsertVote(itemId, value);
	} catch {
		items.rows[idx].my_vote = old.my_vote;
		items.rows[idx].score = old.score;
	}
}

export async function deleteVote(itemId: string): Promise<void> {
	const idx = items.rows.findIndex((r) => r.id === itemId);
	if (idx === -1) return;
	const old = { my_vote: items.rows[idx].my_vote, score: items.rows[idx].score };
	items.rows[idx].my_vote = null;
	items.rows[idx].score = old.score - (old.my_vote ?? 0);
	try {
		await apiDeleteVote(itemId);
	} catch {
		items.rows[idx].my_vote = old.my_vote;
		items.rows[idx].score = old.score;
	}
}

export async function softDeleteItem(itemId: string): Promise<void> {
	const idx = items.rows.findIndex((r) => r.id === itemId);
	if (idx === -1) return;
	const item = { ...items.rows[idx] };
	items.rows = [...items.rows.slice(0, idx), ...items.rows.slice(idx + 1)];
	const timerId = setTimeout(() => {
		items.pendingDelete = null;
	}, 6000);
	items.pendingDelete = { item, timerId };
	try {
		await apiSoftDelete(itemId);
	} catch {
		clearTimeout(timerId);
		items.rows = [...items.rows.slice(0, idx), item, ...items.rows.slice(idx)];
		items.pendingDelete = null;
	}
}

export async function undoDelete(): Promise<void> {
	if (!items.pendingDelete) return;
	const { item, timerId } = items.pendingDelete;
	clearTimeout(timerId);
	try {
		await apiRestore(item.id);
		items.rows = [item, ...items.rows].sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.created_at.localeCompare(b.created_at);
		});
		items.pendingDelete = null;
	} catch (err) {
		items.error = err instanceof Error ? err.message : 'Failed to restore item';
		const fallbackTimer = setTimeout(() => {
			items.pendingDelete = null;
			items.error = null;
		}, 4000);
		items.pendingDelete = { item, timerId: fallbackTimer };
	}
}

export async function addItem(listId: string, name: string, notes?: string): Promise<void> {
	try {
		await apiAddItem(listId, name, notes);
		await loadItems(listId);
	} catch (err) {
		items.error = err instanceof Error ? err.message : 'Failed to add item';
	}
}

export async function editItem(itemId: string, name: string, notes: string): Promise<void> {
	if (!items.listId) return;
	const listId = items.listId;
	try {
		await apiEditItem(itemId, name, notes);
		await loadItems(listId);
	} catch {
		// rows unchanged on error
	}
}
