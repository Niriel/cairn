import { tick } from 'svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$lib/shared/state/session.svelte');

// Re-import both modules fresh each test so the $effect.root fires cleanly.
let sessionMod: typeof import('./session.svelte');
let profileMod: typeof import('./profile.svelte');

beforeEach(async () => {
	vi.resetModules();
	sessionMod = await import('./session.svelte');
	profileMod = await import('./profile.svelte');
});

const TEST_UID = '11111111-1111-1111-1111-111111111111';

describe('profile store', () => {
	test('(a) signed-in → fetches display name', async () => {
		expect(profileMod.profile.displayName).toBeNull();
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(profileMod.profile.displayName).toBe('Alice');
		});
	});

	test('(b) signed-in then signed-out → resets to null', async () => {
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(profileMod.profile.displayName).toBe('Alice');
		});
		await sessionMod.signOut();
		await tick();
		expect(profileMod.profile.displayName).toBeNull();
	});
});
