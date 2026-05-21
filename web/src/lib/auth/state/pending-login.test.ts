import { tick } from 'svelte';
import { beforeEach, describe, expect, test } from 'vitest';

import { onUnauthorized, session, setSignedIn } from '$lib/shared/state/session.svelte';

import { clearPendingLogin, pendingLogin, setPendingLogin } from './pending-login.svelte';

// File-scope `beforeEach` is a deliberate, narrow extension of the
// `writing-tests.md` harness-lifecycle exception. `pendingLogin.email`
// and `session.current` are real module-singleton state — direct proxy
// assignment is the same wholesale-replace pattern case 5 uses for the
// `unknown` setup. Resetting through `signOut()` was rejected: it would
// fire a best-effort `DELETE /auth/session` per test for state the test
// can mutate synchronously. See Task 3.2 Decisions.
beforeEach(async () => {
	clearPendingLogin();
	session.current = { status: 'signed-out' };
	await tick();
});

describe('pendingLogin', () => {
	test('starts as null', () => {
		expect(pendingLogin.email).toBeNull();
	});

	test('setPendingLogin writes the email', () => {
		setPendingLogin('alice@example.test');
		expect(pendingLogin.email).toBe('alice@example.test');
	});

	test('clearPendingLogin resets to null', () => {
		setPendingLogin('alice@example.test');
		clearPendingLogin();
		expect(pendingLogin.email).toBeNull();
	});

	test('auto-clears on signed-in transition', async () => {
		setPendingLogin('alice@example.test');
		// Pre-condition pin: rules out that the next null came from a
		// missed setup step or a state leak rather than from the
		// `$effect.root` reacting to the signed-in transition.
		expect(pendingLogin.email).toBe('alice@example.test');
		setSignedIn({ id: 'u1', email: 'alice@example.test' });
		await tick();
		expect(pendingLogin.email).toBeNull();
	});

	test('does not auto-clear on signed-out transition (flow-in-progress)', async () => {
		// Direct proxy assignment: there is intentionally no `setUnknown()`
		// entrypoint on the session module, so reaching `unknown` requires
		// the wholesale-replace pattern. Justified in Task 3.2 Decisions.
		session.current = { status: 'unknown' };
		await tick();
		setPendingLogin('alice@example.test');
		onUnauthorized();
		await tick();
		expect(pendingLogin.email).toBe('alice@example.test');
	});
});
