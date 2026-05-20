import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { devPasswordSignIn, HttpError, sendMagicLink } from '$lib/auth/model/auth-client';
import { isDevLoginShortcutEnabled } from '$lib/auth/model/dev-shortcut';
import { setPendingLogin } from '$lib/auth/state/pending-login.svelte';
import { setSignedIn } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import LoginRequest from './LoginRequest.svelte';

vi.mock('$lib/auth/model/auth-client');
vi.mock('$lib/auth/state/pending-login.svelte');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$lib/auth/model/dev-shortcut', () => ({
	isDevLoginShortcutEnabled: vi.fn(() => false)
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

beforeAll(() => {
	vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'cairn-dev');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

afterEach(() => {
	vi.clearAllMocks();
});

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'alice@example.test' };

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

	test('(d) 4xx renders inline error, no navigate, no setPendingLogin', async () => {
		vi.mocked(sendMagicLink).mockRejectedValueOnce(new HttpError(400, 'invalid email'));

		const { getByDataTest, queryByDataTest } = render(LoginRequest);
		await fireEvent.input(getByDataTest('login-email'), {
			target: { value: 'alice@example.test' }
		});
		await fireEvent.click(getByDataTest('login-submit'));
		await tick();
		await tick();

		expect(queryByDataTest('login-error')).not.toBeNull();
		expect(vi.mocked(setPendingLogin)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e) 5xx opens Snackbar, no setPendingLogin', async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(sendMagicLink).mockRejectedValueOnce(new HttpError(503, 'service unavailable'));
			const { getByDataTest, queryByDataTest } = render(LoginRequest);
			await fireEvent.input(getByDataTest('login-email'), {
				target: { value: 'alice@example.test' }
			});
			await fireEvent.click(getByDataTest('login-submit'));
			await vi.waitFor(() => {
				expect(queryByDataTest('login-snackbar')).not.toBeNull();
			});
			expect(vi.mocked(setPendingLogin)).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(f) non-HttpError rejection (network failure) opens Snackbar', async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(sendMagicLink).mockRejectedValueOnce(new TypeError('Failed to fetch'));
			const { getByDataTest, queryByDataTest } = render(LoginRequest);
			await fireEvent.input(getByDataTest('login-email'), {
				target: { value: 'alice@example.test' }
			});
			await fireEvent.click(getByDataTest('login-submit'));
			await vi.waitFor(() => {
				expect(queryByDataTest('login-snackbar')).not.toBeNull();
			});
			expect(queryByDataTest('login-error')).toBeNull();
			expect(vi.mocked(setPendingLogin)).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(g) dev-shortcut buttons appear when isDevLoginShortcutEnabled returns true', () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
		const { queryByDataTest } = render(LoginRequest);
		expect(queryByDataTest('dev-login-alice')).not.toBeNull();
		expect(queryByDataTest('dev-login-bob')).not.toBeNull();
		expect(queryByDataTest('dev-login-carol')).not.toBeNull();
	});

	test('(h) dev-shortcut buttons absent when isDevLoginShortcutEnabled returns false', () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(false);
		const { queryByDataTest } = render(LoginRequest);
		expect(queryByDataTest('dev-login-alice')).toBeNull();
		expect(queryByDataTest('dev-login-bob')).toBeNull();
		expect(queryByDataTest('dev-login-carol')).toBeNull();
	});

	test('(i) dev-shortcut click calls devPasswordSignIn then session.setSignedIn; no goto', async () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
		vi.mocked(devPasswordSignIn).mockResolvedValueOnce({ user: SEED_USER });

		const { getByDataTest } = render(LoginRequest);
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		await tick();

		expect(vi.mocked(devPasswordSignIn)).toHaveBeenCalledWith('alice@example.test', 'cairn-dev');
		expect(vi.mocked(setSignedIn)).toHaveBeenCalledWith(SEED_USER);
		expect(vi.mocked(goto)).not.toHaveBeenCalled();

		const signInOrder = vi.mocked(devPasswordSignIn).mock.invocationCallOrder[0];
		const setSignedInOrder = vi.mocked(setSignedIn).mock.invocationCallOrder[0];
		expect(signInOrder).toBeLessThan(setSignedInOrder);
	});

	test('(j) dev-shortcut click is disabled in flight — gates other dev buttons and submit too', async () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
		let resolveSignin!: (v: { user: typeof SEED_USER }) => void;
		vi.mocked(devPasswordSignIn).mockImplementationOnce(
			() =>
				new Promise((r) => {
					resolveSignin = r;
				})
		);

		const { getByDataTest } = render(LoginRequest);
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

		resolveSignin({ user: SEED_USER });
		await tick();
		await tick();

		expect(alice.disabled).toBe(false);
		expect(bob.disabled).toBe(false);
		expect(carol.disabled).toBe(false);
	});

	test('(k) dev-shortcut non-HttpError rejection (network failure) opens Snackbar, no setSignedIn', async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
			vi.mocked(devPasswordSignIn).mockRejectedValueOnce(new TypeError('Failed to fetch'));

			const { getByDataTest, queryByDataTest } = render(LoginRequest);
			await fireEvent.click(getByDataTest('dev-login-alice'));
			await vi.waitFor(() => {
				expect(queryByDataTest('login-snackbar')).not.toBeNull();
			});
			expect(getByDataTest('login-snackbar').textContent).toContain(
				"Couldn't reach the server. Try again."
			);
			expect(queryByDataTest('login-error')).toBeNull();
			expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(l) dev-shortcut 4xx HttpError renders inline error, no Snackbar, no setSignedIn', async () => {
		vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
		vi.mocked(devPasswordSignIn).mockRejectedValueOnce(
			new HttpError(400, 'Invalid login credentials')
		);

		const { getByDataTest, queryByDataTest } = render(LoginRequest);
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		await tick();

		expect(queryByDataTest('login-error')).not.toBeNull();
		expect(getByDataTest('login-error').textContent).toContain('Invalid login credentials');
		expect(queryByDataTest('login-snackbar')).toBeNull();
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
	});

	test('(m) dev-shortcut 5xx HttpError opens Snackbar (not inline), no setSignedIn', async () => {
		vi.useFakeTimers();
		try {
			vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true);
			vi.mocked(devPasswordSignIn).mockRejectedValueOnce(new HttpError(503, 'service unavailable'));

			const { getByDataTest, queryByDataTest } = render(LoginRequest);
			await fireEvent.click(getByDataTest('dev-login-alice'));
			await vi.waitFor(() => {
				expect(queryByDataTest('login-snackbar')).not.toBeNull();
			});
			expect(queryByDataTest('login-error')).toBeNull();
			expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(n) no <header> chrome rendered', () => {
		const { container } = render(LoginRequest);
		expect(container.querySelector('header')).toBeNull();
	});
});
