import { vi } from 'vitest';

type InvitePolicy = 'everybody' | 'circle' | 'nobody';

export const userSettings = $state<{
	invitePolicy: InvitePolicy | null;
	recoveryEmail: string | null;
	loaded: boolean;
}>({
	invitePolicy: null,
	recoveryEmail: null,
	loaded: false
});

export const loadUserSettings = vi.fn(async (): Promise<void> => {});
export const setInvitePolicy = vi.fn(
	(_next: InvitePolicy): Promise<{ prevCount: number; newCount: number; tightened: boolean }> =>
		Promise.resolve({ prevCount: 0, newCount: 0, tightened: false })
);
