import { pgGet, pgPatch } from '$lib/shared/http/postgrest';
import { session } from '$lib/shared/state/session.svelte';
import type { List } from '$lib/list/model/list';

export const lists = $state<{
	items: List[];
	loading: boolean;
	error: string | null;
	pendingDelete: { list: List; timerId: ReturnType<typeof setTimeout> } | null;
}>({
	items: [],
	loading: false,
	error: null,
	pendingDelete: null
});

let refreshSignal = $state(0);

export function refreshLists(): void {
	refreshSignal++;
}

export function adjustItemCount(listId: string, delta: number): void {
	const entry = lists.items.find((l) => l.id === listId);
	if (entry) entry.item_count += delta;
}

export async function deleteList(listId: string): Promise<void> {
	if (lists.pendingDelete) clearTimeout(lists.pendingDelete.timerId);
	const idx = lists.items.findIndex((l) => l.id === listId);
	if (idx === -1) return;
	const list = { ...lists.items[idx] };
	lists.items = [...lists.items.slice(0, idx), ...lists.items.slice(idx + 1)];
	const timerId = setTimeout(() => {
		lists.pendingDelete = null;
	}, 6000);
	lists.pendingDelete = { list, timerId };
	try {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient value used for ISO string, not reactive state
		await pgPatch<void>(`/lists?id=eq.${listId}`, { deleted_at: new Date().toISOString() });
	} catch {
		clearTimeout(timerId);
		lists.items = [...lists.items.slice(0, idx), list, ...lists.items.slice(idx)];
		lists.pendingDelete = null;
	}
}

export async function undoDeleteList(): Promise<void> {
	if (!lists.pendingDelete) return;
	const { list, timerId } = lists.pendingDelete;
	clearTimeout(timerId);
	try {
		await pgPatch<void>(`/lists?id=eq.${list.id}`, { deleted_at: null });
		lists.items = [list, ...lists.items].sort((a, b) => b.modified_at.localeCompare(a.modified_at));
		lists.pendingDelete = null;
	} catch (err) {
		lists.error = err instanceof Error ? err.message : 'Failed to restore list';
		const fallbackTimer = setTimeout(() => {
			lists.pendingDelete = null;
			lists.error = null;
		}, 4000);
		lists.pendingDelete = { list, timerId: fallbackTimer };
	}
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
				// Two client-side gates the lists_select RLS policy can't express on its own:
				//   &deleted_at=is.null — lists_select lets the deleter read their own soft-deleted
				//     rows (needed for the PATCH WITH CHECK gate), so filter them out here.
				//   &lists_is_member=is.true — lists_select also lets an invitee read the row of a
				//     list they have a pending invitation for (migration 0012, so the invite banner
				//     can embed lists(name)); those un-accepted lists must NOT appear in the Lists
				//     collection. The lists_is_member computed column (migration 0013) gates the
				//     collection to lists you're actually a member of, leaving the banner embed
				//     untouched.
				'/lists?select=id,name,description,modified_at,item_count:lists_item_count,is_public,list_members(user_id,profiles(display_name,avatar_version))&list_members.deleted_at=is.null&deleted_at=is.null&lists_is_member=is.true&order=modified_at.desc'
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
