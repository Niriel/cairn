import { fetchDeletedItems, fetchListName, type DeletedItem } from '$lib/item/model/item-trash';
import { restoreItem } from '$lib/item/model/item';
import { adjustItemCount } from '$lib/list/state/lists.svelte';

export const itemTrash = $state<{
	rows: DeletedItem[];
	loading: boolean;
	error: string | null;
	listId: string | null;
	listName: string | null;
}>({ rows: [], loading: false, error: null, listId: null, listName: null });

let errorTimer: ReturnType<typeof setTimeout> | null = null;

function clearErrorTimer(): void {
	if (errorTimer !== null) {
		clearTimeout(errorTimer);
		errorTimer = null;
	}
}

function scheduleErrorClear(): void {
	clearErrorTimer();
	errorTimer = setTimeout(() => {
		itemTrash.error = null;
		errorTimer = null;
	}, 4000);
}

export async function loadTrash(listId: string): Promise<void> {
	clearErrorTimer();
	itemTrash.rows = [];
	itemTrash.listName = null;
	itemTrash.error = null;
	itemTrash.loading = true;
	itemTrash.listId = listId;
	const [itemsResult, nameResult] = await Promise.allSettled([
		fetchDeletedItems(listId),
		fetchListName(listId)
	]);
	if (itemsResult.status === 'fulfilled') {
		itemTrash.rows = itemsResult.value;
	} else {
		itemTrash.rows = [];
		itemTrash.error = "Couldn't load — try again.";
		scheduleErrorClear();
	}
	if (nameResult.status === 'fulfilled') {
		itemTrash.listName = nameResult.value;
	}
	itemTrash.loading = false;
}

export async function restoreOne(itemId: string): Promise<void> {
	try {
		await restoreItem(itemId);
		clearErrorTimer();
		const idx = itemTrash.rows.findIndex((r) => r.id === itemId);
		if (idx !== -1) {
			itemTrash.rows = [...itemTrash.rows.slice(0, idx), ...itemTrash.rows.slice(idx + 1)];
		}
		if (itemTrash.listId) adjustItemCount(itemTrash.listId, +1);
	} catch {
		itemTrash.error = "Couldn't restore — try again.";
		scheduleErrorClear();
	}
}
