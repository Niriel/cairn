import { pgGet } from '$lib/shared/http/postgrest';
import { session } from '$lib/shared/state/session.svelte';
import type { List } from '$lib/list/model/list';

export const lists = $state<{ items: List[]; loading: boolean; error: string | null }>({
	items: [],
	loading: false,
	error: null
});

let refreshSignal = $state(0);

export function refreshLists(): void {
	refreshSignal++;
}

$effect.root(() => {
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		refreshSignal;
		const s = session.current;
		if (s.status === 'signed-in') {
			lists.loading = true;
			lists.error = null;
			pgGet<List[]>(
				// lists_select allows the deleter to read their own soft-deleted rows (needed for
				// the PATCH WITH CHECK gate), so the client must filter them out explicitly.
				'/lists?select=id,name,description,modified_at,item_count:lists_item_count,list_members(user_id,profiles(display_name,avatar_version))&list_members.deleted_at=is.null&deleted_at=is.null&order=modified_at.desc'
			)
				.then((result) => {
					lists.items = result;
					lists.loading = false;
				})
				.catch((err: unknown) => {
					lists.error = err instanceof Error ? err.message : 'Failed to load lists';
					lists.loading = false;
				});
		} else if (s.status === 'signed-out' || s.status === 'unknown') {
			lists.items = [];
			lists.loading = false;
			lists.error = null;
		}
	});
});
