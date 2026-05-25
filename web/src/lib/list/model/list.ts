import { pgPost } from '$lib/shared/http/postgrest';

export type List = {
	id: string;
	name: string;
	description: string | null;
	modified_at: string;
	item_count: number;
	list_members: { user_id: string; profiles: { display_name: string; avatar_version: number } }[];
};

export function createList(name: string, description?: string): Promise<List> {
	return pgPost<List>('/rpc/create_list', { name, description: description ?? null });
}
