import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { HttpError, sendMagicLink } from '$lib/auth/model/auth-client';
import { isDevLoginShortcutEnabled } from '$lib/auth/model/dev-shortcut';
import { setPendingLogin } from '$lib/auth/state/pending-login.svelte';
import { render } from '$lib/test/render';

import LoginRequest from './LoginRequest.svelte';

vi.mock('$lib/auth/model/auth-client');
vi.mock('$lib/auth/state/pending-login.svelte');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$lib/auth/model/dev-shortcut', () => ({
	isDevLoginShortcutEnabled: vi.fn(() => false)
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

afterEach(() => {
	vi.clearAllMocks();
});

describe('LoginRequest', () => {
	test('(a) submit disabled until the email is syntactically valid', async () => {
		const { getByDataTest } = render(LoginRequest);
		const submit = getByDataTest('login-submit') as HTMLButtonElement;
		const email = getByDataTest('login-email') as HTMLInputElement;
		expect(submit.disabled).toBe(true);

		await fireEvent.input(email, { target: { value: 'not-an-email' } });
		expect(submit.disabled).toBe(true);

		await fireEvent.input(email, { target: { value: 'alice@example.test' } });
		expect(submit.disabled).toBe(false);
	});

	test('(b) submit disabled while sendMagicLink is in flight — gates dev buttons too', async () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
		let resolveSend!: () => void;
		vi.mocked(sendMagicLink).mockImplementationOnce(
			() =>
				new Promise<void>((r) => {
					resolveSend = r;
				})
		);

		const { getByDataTest } = render(LoginRequest);
		const submit = getByDataTest('login-submit') as HTMLButtonElement;
		const email = getByDataTest('login-email') as HTMLInputElement;
		await vi.waitFor(() => getByDataTest('dev-login-alice'));
		const alice = getByDataTest('dev-login-alice') as HTMLButtonElement;
		const bob = getByDataTest('dev-login-bob') as HTMLButtonElement;
		const carol = getByDataTest('dev-login-carol') as HTMLButtonElement;

		await fireEvent.input(email, { target: { value: 'alice@example.test' } });
		await fireEvent.click(submit);
		await tick();

		expect(submit.disabled).toBe(true);
		expect(alice.disabled).toBe(true);
		expect(bob.disabled).toBe(true);
		expect(carol.disabled).toBe(true);

		await fireEvent.click(submit);
		await tick();
		expect(vi.mocked(sendMagicLink)).toHaveBeenCalledTimes(1);

		resolveSend();
		await vi.waitFor(() => {
			expect(submit.disabled).toBe(false);
		});
		expect(alice.disabled).toBe(false);
		expect(bob.disabled).toBe(false);
		expect(carol.disabled).toBe(false);
	});

	test('(c) valid submit writes pendingLogin BEFORE navigating to bare /auth/check', async () => {
		vi.mocked(sendMagicLink).mockResolvedValueOnce(undefined);

		const { getByDataTest } = render(LoginRequest);
		await fireEvent.input(getByDataTest('login-email'), {
			target: { value: 'alice@example.test' }
		});
		await fireEvent.click(getByDataTest('login-submit'));
		await tick();
		await tick();

		expect(vi.mocked(sendMagicLink)).toHaveBeenCalledWith('alice@example.test');
		expect(vi.mocked(setPendingLogin)).toHaveBeenCalledWith('alice@example.test');
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/check');

		const setPendingOrder = vi.mocked(setPendingLogin).mock.invocationCallOrder[0];
		const gotoOrder = vi.mocked(goto).mock.invocationCallOrder[0];
		expect(setPendingOrder).toBeLessThan(gotoOrder);
	});

	test('(d) 4xx still navigates to /auth/check, sets pendingLogin, shows no error UI', async () => {
		vi.mocked(sendMagicLink).mockRejectedValueOnce(new HttpError(400, 'invalid email'));

		const { getByDataTest, queryByDataTest } = render(LoginRequest);
		await fireEvent.input(getByDataTest('login-email'), {
			target: { value: 'alice@example.test' }
		});
		await fireEvent.click(getByDataTest('login-submit'));
		await tick();
		await tick();

		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/check');
		expect(vi.mocked(setPendingLogin)).toHaveBeenCalledWith('alice@example.test');
		expect(queryByDataTest('login-error')).toBeNull();
	});

	test('(e) 5xx still navigates to /auth/check, sets pendingLogin, no snackbar', async () => {
		vi.mocked(sendMagicLink).mockRejectedValueOnce(new HttpError(503, 'service unavailable'));

		const { getByDataTest, queryByDataTest } = render(LoginRequest);
		await fireEvent.input(getByDataTest('login-email'), {
			target: { value: 'alice@example.test' }
		});
		await fireEvent.click(getByDataTest('login-submit'));
		await tick();
		await tick();

		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/check');
		expect(vi.mocked(setPendingLogin)).toHaveBeenCalledWith('alice@example.test');
		expect(queryByDataTest('login-error')).toBeNull();
		expect(queryByDataTest('login-snackbar')).toBeNull();
	});

	test('(f) non-HttpError rejection (network failure) still navigates to /auth/check, no snackbar', async () => {
		vi.mocked(sendMagicLink).mockRejectedValueOnce(new TypeError('Failed to fetch'));

		const { getByDataTest, queryByDataTest } = render(LoginRequest);
		await fireEvent.input(getByDataTest('login-email'), {
			target: { value: 'alice@example.test' }
		});
		await fireEvent.click(getByDataTest('login-submit'));
		await tick();
		await tick();

		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/check');
		expect(vi.mocked(setPendingLogin)).toHaveBeenCalledWith('alice@example.test');
		expect(queryByDataTest('login-error')).toBeNull();
		expect(queryByDataTest('login-snackbar')).toBeNull();
	});

	test('(h) dev-shortcut buttons absent when isDevLoginShortcutEnabled returns false', async () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(false);
		const { queryByDataTest } = render(LoginRequest);
		// Give the dynamic import a chance to resolve so absence isn't trivial.
		await vi.waitFor(() => {
			expect(vi.mocked(isDevLoginShortcutEnabled)).toHaveBeenCalled();
		});
		await tick();
		expect(queryByDataTest('dev-login-alice')).toBeNull();
		expect(queryByDataTest('dev-login-bob')).toBeNull();
		expect(queryByDataTest('dev-login-carol')).toBeNull();
	});

	test('(j) dev-shortcut click is disabled in flight — gates other dev buttons and submit too', async () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
		const { devPasswordSignIn } = await import('$lib/auth/model/auth-client');
		let resolveSignin!: (v: { user: { id: string; email: string } }) => void;
		vi.mocked(devPasswordSignIn).mockImplementationOnce(
			() =>
				new Promise((r) => {
					resolveSignin = r;
				})
		);

		const { getByDataTest } = render(LoginRequest);
		await vi.waitFor(() => getByDataTest('dev-login-alice'));
		const alice = getByDataTest('dev-login-alice') as HTMLButtonElement;
		const bob = getByDataTest('dev-login-bob') as HTMLButtonElement;
		const carol = getByDataTest('dev-login-carol') as HTMLButtonElement;
		const submit = getByDataTest('login-submit') as HTMLButtonElement;

		await fireEvent.click(alice);
		await tick();

		expect(alice.disabled).toBe(true);
		expect(bob.disabled).toBe(true);
		expect(carol.disabled).toBe(true);
		expect(submit.disabled).toBe(true);

		await fireEvent.click(alice);
		await tick();
		expect(vi.mocked(devPasswordSignIn)).toHaveBeenCalledTimes(1);

		resolveSignin({
			user: { id: '11111111-1111-1111-1111-111111111111', email: 'alice@example.test' }
		});
		await tick();
		await tick();

		expect(alice.disabled).toBe(false);
		expect(bob.disabled).toBe(false);
		expect(carol.disabled).toBe(false);
	});

	test('(n) no <header> chrome rendered', () => {
		const { container } = render(LoginRequest);
		expect(container.querySelector('header')).toBeNull();
	});
});
