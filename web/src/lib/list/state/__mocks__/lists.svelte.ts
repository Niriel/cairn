import { vi } from 'vitest';
import type { List } from '$lib/list/model/list';

export const lists = $state<{ items: List[]; loading: boolean; error: string | null }>({
	items: [],
	loading: false,
	error: null
});

export const refreshLists = vi.fn((): void => {});
