import { vi } from 'vitest';
import type { DeletedList } from '$lib/list/model/list-trash';

export const listTrash = $state<{
	rows: DeletedList[];
	loading: boolean;
	error: string | null;
}>({ rows: [], loading: false, error: null });

export const loadDeletedLists = vi.fn((): Promise<void> => Promise.resolve());
export const restoreOne = vi.fn((_listId: string): Promise<void> => Promise.resolve());
