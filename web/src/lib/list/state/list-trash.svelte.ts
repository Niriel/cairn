import { fetchDeletedLists, restoreList, type DeletedList } from '$lib/list/model/list-trash';

export const listTrash = $state<{
	rows: DeletedList[];
	loading: boolean;
	error: string | null;
}>({ rows: [], loading: false, error: null });

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
		listTrash.error = null;
		errorTimer = null;
	}, 4000);
}

export async function loadDeletedLists(): Promise<void> {
	clearErrorTimer();
	listTrash.rows = [];
	listTrash.error = null;
	listTrash.loading = true;
	try {
		listTrash.rows = await fetchDeletedLists();
	} catch {
		listTrash.rows = [];
		listTrash.error = "Couldn't load — try again.";
		scheduleErrorClear();
	}
	listTrash.loading = false;
}

export async function restoreOne(listId: string): Promise<void> {
	try {
		await restoreList(listId);
		clearErrorTimer();
		const idx = listTrash.rows.findIndex((r) => r.id === listId);
		if (idx !== -1) {
			listTrash.rows = [...listTrash.rows.slice(0, idx), ...listTrash.rows.slice(idx + 1)];
		}
	} catch {
		listTrash.error = "Couldn't restore — try again.";
		scheduleErrorClear();
	}
}
