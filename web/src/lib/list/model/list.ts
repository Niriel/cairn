import { pgPost } from '$lib/shared/http/postgrest';

export type List = {
	id: string;
	name: string;
	description: string | null;
	modified_at: string;
};

export function createList(name: string, description?: string): Promise<List> {
	return pgPost<List>('/rpc/create_list', { name, description: description ?? null });
}
