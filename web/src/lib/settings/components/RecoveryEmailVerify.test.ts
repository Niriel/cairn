import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import { confirmRecoveryEmail, HttpError } from '$lib/auth/model/auth-client';

import RecoveryEmailVerify from './RecoveryEmailVerify.svelte';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/auth/model/auth-client', () => {
	class HttpError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = 'HttpError';
			this.status = status;
		}
	}
	return { HttpError, confirmRecoveryEmail: vi.fn(async () => {}) };
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('RecoveryEmailVerify', () => {
	test('shows the pending address in the body', () => {
		const { getByDataTest } = render(RecoveryEmailVerify, {
			email: 'alice@example.test',
			onConfirmed: () => {}
		});
		expect(getByDataTest('recovery-email-verify-address').textContent).toContain(
			'alice@example.test'
		);
	});

	test('a correct code calls confirmRecoveryEmail and fires onConfirmed', async () => {
		const onConfirmed = vi.fn();
		const { getByDataTest } = render(RecoveryEmailVerify, {
			email: 'alice@example.test',
			onConfirmed
		});
		await fireEvent.input(getByDataTest('recovery-email-code'), { target: { value: '123456' } });
		await fireEvent.click(getByDataTest('recovery-email-verify'));
		expect(vi.mocked(confirmRecoveryEmail)).toHaveBeenCalledWith('123456');
		expect(onConfirmed).toHaveBeenCalledTimes(1);
	});

	test('a bad code shows the inline error and does not fire onConfirmed', async () => {
		const onConfirmed = vi.fn();
		vi.mocked(confirmRecoveryEmail).mockRejectedValueOnce(
			new HttpError(400, 'invalid or expired code')
		);
		const { getByDataTest, queryByDataTest } = render(RecoveryEmailVerify, {
			email: 'alice@example.test',
			onConfirmed
		});
		await fireEvent.input(getByDataTest('recovery-email-code'), { target: { value: '000000' } });
		await fireEvent.click(getByDataTest('recovery-email-verify'));
		expect(queryByDataTest('recovery-email-code-error')).not.toBeNull();
		expect(onConfirmed).not.toHaveBeenCalled();
	});

	test('the code input is focused on mount', () => {
		const { getByDataTest } = render(RecoveryEmailVerify, {
			email: 'alice@example.test',
			onConfirmed: () => {}
		});
		expect(document.activeElement).toBe(getByDataTest('recovery-email-code'));
	});
});
