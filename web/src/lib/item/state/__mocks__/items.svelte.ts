import { vi } from 'vitest';
import type { Item } from '$lib/item/model/item';

export const items = $state<{
	rows: Item[];
	loading: boolean;
	error: string | null;
	listId: string | null;
	pendingDelete: { item: Item; timerId: ReturnType<typeof setTimeout> } | null;
}>({ rows: [], loading: false, error: null, listId: null, pendingDelete: null });

export const loadItems = vi.fn((_listId: string): Promise<void> => Promise.resolve());
export const upsertVote = vi.fn(
	(_itemId: string, _value: number): Promise<void> => Promise.resolve()
);
export const deleteVote = vi.fn((_itemId: string): Promise<void> => Promise.resolve());
export const softDeleteItem = vi.fn((_itemId: string): Promise<void> => Promise.resolve());
export const undoDelete = vi.fn((): Promise<void> => Promise.resolve());
export const addItem = vi.fn(
	(_listId: string, _name: string, _notes?: string): Promise<void> => Promise.resolve()
);
export const editItem = vi.fn(
	(_itemId: string, _name: string, _notes: string): Promise<void> => Promise.resolve()
);
