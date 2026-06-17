import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { HttpError, sendMagicLink, verifyOtp } from '$lib/auth/model/auth-client';
import { setSignedIn } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import LoginCheck from './LoginCheck.svelte';

vi.mock('$lib/auth/model/auth-client');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: (p: string) => p }));

afterEach(() => {
	vi.clearAllMocks();
});

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'alice' };

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

	test('(o) the screen states the link and code stay valid for an hour', () => {
		const { container } = render(LoginCheck, { email: 'alice@example.test' });
		expect(container.textContent).toContain('hour');
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

	test('(g) the verify button stays disabled for an incomplete or non-numeric code', async () => {
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		const verify = getByDataTest('login-check-verify') as HTMLButtonElement;
		const codeInput = getByDataTest('login-check-code') as HTMLInputElement;

		expect(verify.disabled).toBe(true);
		await fireEvent.input(codeInput, { target: { value: '123' } });
		expect(verify.disabled).toBe(true);
		await fireEvent.input(codeInput, { target: { value: '12345x' } });
		expect(verify.disabled).toBe(true);
		expect(vi.mocked(verifyOtp)).not.toHaveBeenCalled();
	});

	test('(h) reaching six valid digits auto-submits verifyOtp exactly once', async () => {
		vi.mocked(verifyOtp).mockResolvedValueOnce({ user: SEED_USER });
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });

		await fireEvent.input(getByDataTest('login-check-code'), { target: { value: '123456' } });
		await tick();

		expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(verifyOtp)).toHaveBeenCalledWith('alice@example.test', '123456');
	});

	test('(i) a second submit is blocked while verifyOtp is in flight', async () => {
		let resolveVerify!: (v: { user: typeof SEED_USER }) => void;
		vi.mocked(verifyOtp).mockImplementationOnce(
			() =>
				new Promise((r) => {
					resolveVerify = r;
				})
		);

		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		const verify = getByDataTest('login-check-verify') as HTMLButtonElement;

		await fireEvent.input(getByDataTest('login-check-code'), { target: { value: '123456' } });
		await tick();
		expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(1);
		expect(verify.disabled).toBe(true);

		// The button is the fallback; while a call is in flight it must not re-fire.
		await fireEvent.click(verify);
		await tick();
		expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(1);

		resolveVerify({ user: SEED_USER });
		await tick();
	});

	test('(j) on success setSignedIn is called before navigating home', async () => {
		vi.mocked(verifyOtp).mockResolvedValueOnce({ user: SEED_USER });
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });

		await fireEvent.input(getByDataTest('login-check-code'), { target: { value: '123456' } });
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/');
		});
		expect(vi.mocked(setSignedIn)).toHaveBeenCalledWith(SEED_USER);

		const setOrder = vi.mocked(setSignedIn).mock.invocationCallOrder[0];
		const gotoOrder = vi.mocked(goto).mock.invocationCallOrder[0];
		expect(setOrder).toBeLessThan(gotoOrder);
	});

	test('(k) a 4xx shows the inline error, does not navigate, and re-enables the button', async () => {
		vi.mocked(verifyOtp).mockRejectedValueOnce(new HttpError(403, 'otp_expired'));
		const { getByDataTest, queryByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		const verify = getByDataTest('login-check-verify') as HTMLButtonElement;

		await fireEvent.input(getByDataTest('login-check-code'), { target: { value: '123456' } });
		await vi.waitFor(() => {
			expect(queryByDataTest('login-check-code-error')).not.toBeNull();
		});
		expect(getByDataTest('login-check-code-error').textContent).toContain('incorrect or expired');
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		// verifying cleared, code still valid → button is an idle fallback.
		expect(verify.disabled).toBe(false);
	});

	test('(l) a 5xx shows the snackbar, no inline error, no navigation', async () => {
		vi.mocked(verifyOtp).mockRejectedValueOnce(new HttpError(503, 'service unavailable'));
		const { getByDataTest, queryByDataTest } = render(LoginCheck, { email: 'alice@example.test' });

		await fireEvent.input(getByDataTest('login-check-code'), { target: { value: '123456' } });
		await vi.waitFor(() => {
			expect(queryByDataTest('login-check-snackbar')).not.toBeNull();
		});
		expect(queryByDataTest('login-check-code-error')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(m) after a 4xx the same code does not re-fire verifyOtp (edge-triggered)', async () => {
		vi.mocked(verifyOtp).mockRejectedValue(new HttpError(403, 'otp_expired'));
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });

		await fireEvent.input(getByDataTest('login-check-code'), { target: { value: '123456' } });
		await vi.waitFor(() => {
			expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(1);
		});
		// Let verifying settle back to false with the value still six digits.
		await tick();
		await tick();
		expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(1);
	});

	test('(n) a fresh edit after a 4xx re-arms auto-submit', async () => {
		vi.mocked(verifyOtp)
			.mockRejectedValueOnce(new HttpError(403, 'otp_expired'))
			.mockResolvedValueOnce({ user: SEED_USER });
		const { getByDataTest } = render(LoginCheck, { email: 'alice@example.test' });
		const codeInput = getByDataTest('login-check-code') as HTMLInputElement;

		await fireEvent.input(codeInput, { target: { value: '123456' } });
		await vi.waitFor(() => {
			expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(1);
		});

		await fireEvent.input(codeInput, { target: { value: '654321' } });
		await vi.waitFor(() => {
			expect(vi.mocked(verifyOtp)).toHaveBeenCalledTimes(2);
		});
		expect(vi.mocked(verifyOtp)).toHaveBeenLastCalledWith('alice@example.test', '654321');
	});
});
