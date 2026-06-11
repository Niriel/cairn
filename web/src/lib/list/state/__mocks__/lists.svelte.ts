import { vi } from 'vitest';
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

export const refreshLists = vi.fn((): void => {});
export const adjustItemCount = vi.fn((_listId: string, _delta: number): void => {});
export const deleteList = vi.fn(async (_listId: string): Promise<void> => {});
export const undoDeleteList = vi.fn(async (): Promise<void> => {});
export const setPublic = vi.fn(async (_listId: string, _value: boolean): Promise<void> => {});
