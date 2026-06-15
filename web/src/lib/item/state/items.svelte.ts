import { session } from '$lib/shared/state/session.svelte';
import { profile } from '$lib/shared/state/profile.svelte';
import { adjustItemCount } from '$lib/list/state/lists.svelte';
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

function sortRows(rows: Item[]): Item[] {
	return [...rows].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.created_at.localeCompare(b.created_at);
	});
}

export async function loadItems(listId: string): Promise<void> {
	const s = session.current;
	if (s.status !== 'signed-in') return;
	items.loading = true;
	items.error = null;
	try {
		items.rows = sortRows(await fetchItems(listId, s.user.id));
		items.listId = listId;
	} catch (err) {
		items.error = err instanceof Error ? err.message : 'Failed to load items';
	} finally {
		items.loading = false;
	}
}

export async function upsertVote(itemId: string, value: number): Promise<void> {
	const s = session.current;
	if (s.status !== 'signed-in') return;
	const uid = s.user.id;
	const row = items.rows.find((r) => r.id === itemId);
	if (!row) return;
	const old = { my_vote: row.my_vote, score: row.score, member_votes: row.member_votes };
	row.my_vote = value;
	row.score = old.score + value - (old.my_vote ?? 0);
	// Reflect the vote in the per-member breakdown shown in the extra panel:
	// update the caller's existing entry, or add one if they hadn't voted yet.
	row.member_votes = old.member_votes.some((mv) => mv.user_id === uid)
		? old.member_votes.map((mv) => (mv.user_id === uid ? { ...mv, value } : mv))
		: [
				...old.member_votes,
				{
					user_id: uid,
					display_name: profile.displayName ?? 'Unknown',
					avatar_version: profile.avatarVersion,
					value
				}
			];
	try {
		await apiUpsertVote(itemId, value, uid);
	} catch {
		row.my_vote = old.my_vote;
		row.score = old.score;
		row.member_votes = old.member_votes;
	}
}

export async function deleteVote(itemId: string): Promise<void> {
	const s = session.current;
	if (s.status !== 'signed-in') return;
	const uid = s.user.id;
	const row = items.rows.find((r) => r.id === itemId);
	if (!row) return;
	const old = { my_vote: row.my_vote, score: row.score, member_votes: row.member_votes };
	row.my_vote = null;
	row.score = old.score - (old.my_vote ?? 0);
	// Drop the caller's entry from the per-member breakdown.
	row.member_votes = old.member_votes.filter((mv) => mv.user_id !== uid);
	try {
		await apiDeleteVote(itemId);
	} catch {
		row.my_vote = old.my_vote;
		row.score = old.score;
		row.member_votes = old.member_votes;
	}
}

export async function softDeleteItem(itemId: string): Promise<void> {
	if (items.pendingDelete) clearTimeout(items.pendingDelete.timerId);
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
		adjustItemCount(item.list_id, -1);
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
		items.rows = sortRows([item, ...items.rows]);
		items.pendingDelete = null;
		adjustItemCount(item.list_id, +1);
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
		adjustItemCount(listId, +1);
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
