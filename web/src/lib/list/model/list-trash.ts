import { pgGet, pgPatch } from '$lib/shared/http/postgrest';
import { fetchDisplayNames } from '$lib/shared/model/profile-names';

export type DeletedList = {
	id: string;
	name: string;
	description: string | null;
	deleted_by: string;
	deleted_by_name: string;
	deleted_at: string;
};

type DeletedListRow = {
	id: string;
	name: string;
	description: string | null;
	deleted_by: string;
	deleted_at: string;
};

export async function fetchDeletedLists(): Promise<DeletedList[]> {
	const rows = await pgGet<DeletedListRow[]>(
		'/lists_deleted?order=deleted_at.desc&select=id,name,description,deleted_by,deleted_at'
	);
	let names: Map<string, string>;
	try {
		names = await fetchDisplayNames(rows.map((r) => r.deleted_by));
	} catch {
		names = new Map();
	}
	return rows.map((r) => ({
		...r,
		deleted_by_name: names.get(r.deleted_by) ?? 'Unknown'
	}));
}

export function restoreList(listId: string): Promise<void> {
	// Send only deleted_at: null — the tg_set_attribution_lists trigger's
	// restore branch clears deleted_by automatically.
	return pgPatch(`/lists?id=eq.${listId}`, { deleted_at: null });
}
