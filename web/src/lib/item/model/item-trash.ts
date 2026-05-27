import { pgGet } from '$lib/shared/http/postgrest';
import { fetchDisplayNames } from '$lib/shared/model/profile-names';

export type DeletedItem = {
	id: string;
	list_id: string;
	name: string;
	notes: string | null;
	deleted_by: string;
	deleted_by_name: string;
	deleted_at: string;
};

type DeletedItemRow = {
	id: string;
	list_id: string;
	name: string;
	notes: string | null;
	deleted_by: string;
	deleted_at: string;
};

export async function fetchDeletedItems(listId: string): Promise<DeletedItem[]> {
	const rows = await pgGet<DeletedItemRow[]>(
		`/items_deleted?list_id=eq.${listId}&order=deleted_at.desc&select=id,list_id,name,notes,deleted_by,deleted_at`
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

export async function fetchListName(listId: string): Promise<string | null> {
	const rows = await pgGet<{ name: string }[]>(`/lists?id=eq.${listId}&select=name`);
	return rows[0]?.name ?? null;
}
