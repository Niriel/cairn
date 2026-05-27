import { vi } from 'vitest';
import type { DeletedItem } from '$lib/item/model/item-trash';

export const itemTrash = $state<{
	rows: DeletedItem[];
	loading: boolean;
	error: string | null;
	listId: string | null;
	listName: string | null;
}>({ rows: [], loading: false, error: null, listId: null, listName: null });

export const loadTrash = vi.fn((_listId: string): Promise<void> => Promise.resolve());
export const restoreOne = vi.fn((_itemId: string): Promise<void> => Promise.resolve());
