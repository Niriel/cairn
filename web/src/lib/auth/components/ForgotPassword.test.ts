import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { HttpError, requestPasswordReset } from '$lib/auth/model/auth-client';
import { setPendingReset } from '$lib/auth/state/pending-reset.svelte';
import { render } from '$lib/test/render';

import ForgotPassword from './ForgotPassword.svelte';

vi.mock('$lib/auth/model/auth-client', () => {
	class HttpError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = 'HttpError';
			this.status = status;
		}
	}
	return { HttpError, requestPasswordReset: vi.fn(async () => {}) };
});
vi.mock('$lib/auth/state/pending-reset.svelte', () => ({
	pendingReset: { username: null },
	setPendingReset: vi.fn(),
	clearPendingReset: vi.fn()
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
	vi.clearAllMocks();
});

async function submitUsername(getByDataTest: (n: string) => HTMLElement) {
	await fireEvent.input(getByDataTest('forgot-username'), { target: { value: 'dev' } });
	await fireEvent.click(getByDataTest('forgot-submit'));
	await tick();
	await tick();
}

describe('ForgotPassword', () => {
	test('(a) submit disabled until a username is entered', async () => {
		const { getByDataTest } = render(ForgotPassword);
		const submit = getByDataTest('forgot-submit') as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		await fireEvent.input(getByDataTest('forgot-username'), { target: { value: 'dev' } });
		expect(submit.disabled).toBe(false);
	});

	test('(b) on success: requests the reset, stores the username, advances to reset screen', async () => {
		vi.mocked(requestPasswordReset).mockResolvedValueOnce(undefined);
		const { getByDataTest, queryByDataTest } = render(ForgotPassword);
		await submitUsername(getByDataTest);
		expect(vi.mocked(requestPasswordReset)).toHaveBeenCalledWith('dev');
		expect(vi.mocked(setPendingReset)).toHaveBeenCalledWith('dev');
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/reset-password');
		expect(queryByDataTest('forgot-error')).toBeNull();
	});

	test('(c) a 4xx is swallowed: still advances, no error UI', async () => {
		vi.mocked(requestPasswordReset).mockRejectedValueOnce(new HttpError(429, 'too many requests'));
		const { getByDataTest, queryByDataTest } = render(ForgotPassword);
		await submitUsername(getByDataTest);
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/reset-password');
		expect(vi.mocked(setPendingReset)).toHaveBeenCalledWith('dev');
		expect(queryByDataTest('forgot-error')).toBeNull();
		expect(queryByDataTest('forgot-snackbar')).toBeNull();
	});

	test('(d) a 5xx is swallowed: still advances, no error UI', async () => {
		vi.mocked(requestPasswordReset).mockRejectedValueOnce(
			new HttpError(503, 'service unavailable')
		);
		const { getByDataTest, queryByDataTest } = render(ForgotPassword);
		await submitUsername(getByDataTest);
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/reset-password');
		expect(queryByDataTest('forgot-error')).toBeNull();
		expect(queryByDataTest('forgot-snackbar')).toBeNull();
	});

	test('(e) a non-HttpError rejection (network) is swallowed: still advances', async () => {
		vi.mocked(requestPasswordReset).mockRejectedValueOnce(new TypeError('Failed to fetch'));
		const { getByDataTest, queryByDataTest } = render(ForgotPassword);
		await submitUsername(getByDataTest);
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/reset-password');
		expect(vi.mocked(setPendingReset)).toHaveBeenCalledWith('dev');
		expect(queryByDataTest('forgot-error')).toBeNull();
	});
});
