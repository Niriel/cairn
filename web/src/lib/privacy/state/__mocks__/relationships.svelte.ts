import { vi } from 'vitest';
import type { BlockedEntry, CircleEntry } from '$lib/privacy/model/relationship';
import type { AddCircleResult } from '../relationships.svelte';

export const relationships = $state<{
	circle: CircleEntry[];
	blocked: BlockedEntry[];
	loaded: boolean;
	loading: boolean;
}>({
	circle: [],
	blocked: [],
	loaded: false,
	loading: false
});

export const loadRelationships = vi.fn(async (): Promise<void> => {});
export const addCircleByUsername = vi.fn(
	(_username: string): Promise<AddCircleResult> => Promise.resolve({ ok: true as const })
);
export const addCircleById = vi.fn(async (_otherUserId: string): Promise<void> => {});
export const removeFromCircle = vi.fn(async (_otherUserId: string): Promise<void> => {});
export const block = vi.fn(async (_otherUserId: string): Promise<void> => {});
export const unblock = vi.fn(async (_otherUserId: string): Promise<void> => {});
