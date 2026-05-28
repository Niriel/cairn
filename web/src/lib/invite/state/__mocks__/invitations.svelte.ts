import { vi } from 'vitest';
import type { SentEntry } from '../invitations.svelte';

export const invitations = $state<{
	sent: SentEntry[];
}>({ sent: [] });

export const loadSent = vi.fn(async (): Promise<void> => {});
export const pendingInviteFor = vi.fn((_listId: string, _userId: string): string | null => null);
export const cancelInvitation = vi.fn(async (_id: string): Promise<void> => {});
