import { SvelteSet } from 'svelte/reactivity';
import { vi } from 'vitest';
import type { InboxEntry, SentEntry } from '../invitations.svelte';

export const invitations = $state<{
	sent: SentEntry[];
	inbox: InboxEntry[];
	inboxLoading: boolean;
	postAcceptPrompts: SvelteSet<{ inviterUid: string; inviterName: string }>;
}>({ sent: [], inbox: [], inboxLoading: false, postAcceptPrompts: new SvelteSet() });

export const loadSent = vi.fn(async (): Promise<void> => {});
export const pendingInviteFor = vi.fn((_listId: string, _userId: string): string | null => null);
export const cancelInvitation = vi.fn(async (_id: string): Promise<void> => {});
export const loadInbox = vi.fn((): Promise<void> => Promise.resolve());
export const acceptInvitation = vi.fn(
	(_id: string): Promise<{ inviterUid: string; inviterName: string; listId: string }> =>
		Promise.resolve({ inviterUid: '', inviterName: '', listId: '' })
);
export const declineInvitation = vi.fn((_id: string): Promise<void> => Promise.resolve());
export const sendInvitation = vi.fn(
	(_listId: string, _target: { userId: string } | { email: string }): Promise<void> =>
		Promise.resolve()
);
