// Mirrors `pending-login.svelte.ts` as a $state-backed proxy plus
// `vi.fn()` spies whose default implementations write the matching
// post-condition. No `$effect.root` here — the auto-clear contract is
// exercised exclusively in `pending-login.test.ts` against the real
// module.

import { vi } from 'vitest';

export const pendingLogin: { email: string | null } = $state({ email: null });

export const setPendingLogin = vi.fn((email: string) => {
	pendingLogin.email = email;
});

export const clearPendingLogin = vi.fn(() => {
	pendingLogin.email = null;
});
