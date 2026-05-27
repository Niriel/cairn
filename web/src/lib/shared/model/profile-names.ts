import { pgGet } from '$lib/shared/http/postgrest';

type ProfileNameRow = { id: string; display_name: string };

export async function fetchDisplayNames(uids: string[]): Promise<Map<string, string>> {
	if (uids.length === 0) return new Map();
	const unique = Array.from(new Set(uids));
	const csv = unique.join(',');
	const rows = await pgGet<ProfileNameRow[]>(`/profiles?id=in.(${csv})&select=id,display_name`);
	const map = new Map<string, string>();
	for (const row of rows) map.set(row.id, row.display_name);
	return map;
}
