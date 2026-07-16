import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { HttpError, resetPassword } from '$lib/auth/model/auth-client';
import { pendingReset } from '$lib/auth/state/pending-reset.svelte';
import { render } from '$lib/test/render';

import ResetPassword from './ResetPassword.svelte';

vi.mock('$lib/auth/model/auth-client', () => {
	class HttpError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = 'HttpError';
			this.status = status;
		}
	}
	return { HttpError, resetPassword: vi.fn(async () => {}) };
});
vi.mock('$lib/auth/state/pending-reset.svelte', () => ({
	pendingReset: { username: null },
	setPendingReset: vi.fn(),
	clearPendingReset: vi.fn()
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
	vi.clearAllMocks();
	pendingReset.username = null;
});

async function fillAndSubmit(
	getByDataTest: (n: string) => HTMLElement,
	{ username, code, password }: { username?: string; code: string; password: string }
) {
	if (username !== undefined) {
		await fireEvent.input(getByDataTest('reset-username'), { target: { value: username } });
	}
	await fireEvent.input(getByDataTest('reset-code'), { target: { value: code } });
	await fireEvent.input(getByDataTest('reset-password-input'), { target: { value: password } });
	await fireEvent.click(getByDataTest('reset-submit'));
	await tick();
	await tick();
}

describe('ResetPassword', () => {
	test('(a) pre-fills the username from the pending-reset store', () => {
		pendingReset.username = 'dev';
		const { getByDataTest } = render(ResetPassword);
		expect((getByDataTest('reset-username') as HTMLInputElement).value).toBe('dev');
	});

	test('(b) success with a typed username (no pending — cross-device): resets and routes to sign-in', async () => {
		// Reached fresh on another device: store is empty, username is typed in.
		vi.mocked(resetPassword).mockResolvedValueOnce(undefined);
		const { getByDataTest } = render(ResetPassword);
		await fillAndSubmit(getByDataTest, {
			username: 'dev',
			code: '123456',
			password: 'new-cairn-pw'
		});
		expect(vi.mocked(resetPassword)).toHaveBeenCalledWith('dev', '123456', 'new-cairn-pw');
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/signin');
	});

	test('(c) a bad code (4xx) shows the inline error and does not navigate', async () => {
		pendingReset.username = 'dev';
		vi.mocked(resetPassword).mockRejectedValueOnce(new HttpError(400, 'invalid or expired code'));
		const { getByDataTest, queryByDataTest } = render(ResetPassword);
		await fillAndSubmit(getByDataTest, { code: '000000', password: 'new-cairn-pw' });
		expect(queryByDataTest('reset-error')).not.toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(d) a transient failure (5xx) shows the snackbar, not the inline error', async () => {
		pendingReset.username = 'dev';
		vi.mocked(resetPassword).mockRejectedValueOnce(new HttpError(502, 'upstream unavailable'));
		const { getByDataTest, queryByDataTest } = render(ResetPassword);
		await fillAndSubmit(getByDataTest, { code: '123456', password: 'new-cairn-pw' });
		expect(queryByDataTest('reset-snackbar')).not.toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e) submitting with no username at all falls back to /auth/forgot-password', async () => {
		// No pending username and none typed: cannot reset, bounce to request screen.
		const { getByDataTest } = render(ResetPassword);
		await fillAndSubmit(getByDataTest, { code: '123456', password: 'new-cairn-pw' });
		expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/forgot-password');
	});
});
