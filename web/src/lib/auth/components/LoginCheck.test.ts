import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { HttpError, sendMagicLink } from '$lib/auth/model/auth-client';
import { render } from '$lib/test/render';

import LoginCheck from './LoginCheck.svelte';

vi.mock('$lib/auth/model/auth-client');

afterEach(() => {
	vi.clearAllMocks();
});

describe('LoginCheck', () => {
	test('(a) renders the heading and the email from the email prop', () => {
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		expect(getByDataTest('login-check-heading').textContent).toContain('Check your inbox');
		expect(getByDataTest('login-check-email').textContent).toContain('alice@example.test');
	});

	test('(b) "Send again" calls sendMagicLink with the email', async () => {
		vi.mocked(sendMagicLink).mockResolvedValueOnce(undefined);
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		await fireEvent.click(getByDataTest('login-check-resend'));
		await tick();
		expect(vi.mocked(sendMagicLink)).toHaveBeenCalledWith('alice@example.test');
	});

	test('(c) "Send again" is disabled while the previous call is in flight', async () => {
		let resolveSend!: () => void;
		vi.mocked(sendMagicLink).mockImplementationOnce(
			() =>
				new Promise<void>((r) => {
					resolveSend = r;
				})
		);

		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		const resend = getByDataTest('login-check-resend') as HTMLButtonElement;

		await fireEvent.click(resend);
		await tick();
		expect(resend.disabled).toBe(true);

		await fireEvent.click(resend);
		await tick();
		expect(vi.mocked(sendMagicLink)).toHaveBeenCalledTimes(1);

		resolveSend();
		await vi.waitFor(() => {
			expect(resend.disabled).toBe(false);
		});
	});

	test('(d) "Sent again." confirmation appears after a successful resend and auto-clears', async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(sendMagicLink).mockResolvedValueOnce(undefined);
			const { getByDataTest, queryByDataTest } = render(LoginCheck, {
				email: 'alice@example.test'
			});
			await fireEvent.click(getByDataTest('login-check-resend'));
			await tick();
			expect(getByDataTest('login-check-resend-confirmation').textContent).toContain('Sent again.');

			vi.advanceTimersByTime(3001);
			await tick();
			expect(queryByDataTest('login-check-resend-confirmation')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(e) no <header> chrome rendered', () => {
		const { container } = render(LoginCheck, { email: 'alice@example.test' });
		expect(container.querySelector('header')).toBeNull();
	});

	test('(f) "Sent again." appears even when sendMagicLink rejects (anti-enumeration)', async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(sendMagicLink).mockRejectedValueOnce(new HttpError(400, 'banned'));
			const { getByDataTest, queryByDataTest } = render(LoginCheck, {
				email: 'alice@example.test'
			});
			await fireEvent.click(getByDataTest('login-check-resend'));
			await tick();
			expect(getByDataTest('login-check-resend-confirmation').textContent).toContain('Sent again.');

			vi.advanceTimersByTime(3001);
			await tick();
			expect(queryByDataTest('login-check-resend-confirmation')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});
