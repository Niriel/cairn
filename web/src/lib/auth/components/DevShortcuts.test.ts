import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { devPasswordSignIn, HttpError } from '$lib/auth/model/auth-client';
import { setSignedIn } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import DevShortcuts from './DevShortcuts.svelte';

vi.mock('$lib/auth/model/auth-client');
vi.mock('$lib/shared/state/session.svelte');

beforeAll(() => {
	vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'cairn-dev');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

afterEach(() => {
	vi.clearAllMocks();
});

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'alice' };

function makeProps(overrides: Partial<{ sending: boolean }> = {}) {
	return {
		sending: false,
		setSending: vi.fn(),
		onInlineError: vi.fn(),
		onServerError: vi.fn(),
		...overrides
	};
}

describe('DevShortcuts', () => {
	test('(g) renders the three dev-login buttons', () => {
		const { queryByDataTest } = render(DevShortcuts, makeProps());
		expect(queryByDataTest('dev-login-alice')).not.toBeNull();
		expect(queryByDataTest('dev-login-bob')).not.toBeNull();
		expect(queryByDataTest('dev-login-carol')).not.toBeNull();
	});

	test('(i) clicking dev-login-alice calls devPasswordSignIn then setSignedIn, in order', async () => {
		vi.mocked(devPasswordSignIn).mockResolvedValueOnce({ user: SEED_USER });

		const { getByDataTest } = render(DevShortcuts, makeProps());
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		await tick();

		expect(vi.mocked(devPasswordSignIn)).toHaveBeenCalledWith('alice@example.test', 'cairn-dev');
		expect(vi.mocked(setSignedIn)).toHaveBeenCalledWith(SEED_USER);

		const signInOrder = vi.mocked(devPasswordSignIn).mock.invocationCallOrder[0];
		const setSignedInOrder = vi.mocked(setSignedIn).mock.invocationCallOrder[0];
		expect(signInOrder).toBeLessThan(setSignedInOrder);
	});

	test('(j-child) all three buttons reflect the `sending` prop', async () => {
		const { getByDataTest, rerender } = render(DevShortcuts, makeProps({ sending: false }));
		const alice = getByDataTest('dev-login-alice') as HTMLButtonElement;
		const bob = getByDataTest('dev-login-bob') as HTMLButtonElement;
		const carol = getByDataTest('dev-login-carol') as HTMLButtonElement;

		expect(alice.disabled).toBe(false);
		expect(bob.disabled).toBe(false);
		expect(carol.disabled).toBe(false);

		await rerender(makeProps({ sending: true }));
		expect(alice.disabled).toBe(true);
		expect(bob.disabled).toBe(true);
		expect(carol.disabled).toBe(true);
	});

	test('(k) non-HttpError rejection calls onServerError, not onInlineError; no setSignedIn', async () => {
		vi.mocked(devPasswordSignIn).mockRejectedValueOnce(new TypeError('Failed to fetch'));
		const props = makeProps();

		const { getByDataTest } = render(DevShortcuts, props);
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		await tick();

		expect(props.onServerError).toHaveBeenCalledTimes(1);
		expect(props.onInlineError).not.toHaveBeenCalled();
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
	});

	test('(l) 4xx HttpError calls onInlineError(err.message); no onServerError; no setSignedIn', async () => {
		vi.mocked(devPasswordSignIn).mockRejectedValueOnce(
			new HttpError(400, 'Invalid login credentials')
		);
		const props = makeProps();

		const { getByDataTest } = render(DevShortcuts, props);
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		await tick();

		expect(props.onInlineError).toHaveBeenCalledWith('Invalid login credentials');
		expect(props.onServerError).not.toHaveBeenCalled();
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
	});

	test('(m) 5xx HttpError calls onServerError, not onInlineError; no setSignedIn', async () => {
		vi.mocked(devPasswordSignIn).mockRejectedValueOnce(new HttpError(503, 'service unavailable'));
		const props = makeProps();

		const { getByDataTest } = render(DevShortcuts, props);
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		await tick();

		expect(props.onServerError).toHaveBeenCalledTimes(1);
		expect(props.onInlineError).not.toHaveBeenCalled();
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
	});

	test('in-flight gating: setSending(true) before await, setSending(false) in finally; no second devPasswordSignIn while pending', async () => {
		let resolveSignin!: (v: { user: typeof SEED_USER }) => void;
		vi.mocked(devPasswordSignIn).mockImplementationOnce(
			() =>
				new Promise((r) => {
					resolveSignin = r;
				})
		);
		const props = makeProps({ sending: false });

		const { getByDataTest, rerender } = render(DevShortcuts, props);
		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();

		expect(props.setSending).toHaveBeenCalledWith(true);
		expect(vi.mocked(devPasswordSignIn)).toHaveBeenCalledTimes(1);

		// Parent would flip sending=true in response to setSending(true). Simulate that.
		await rerender({ ...props, sending: true });

		await fireEvent.click(getByDataTest('dev-login-alice'));
		await tick();
		expect(vi.mocked(devPasswordSignIn)).toHaveBeenCalledTimes(1);

		resolveSignin({ user: SEED_USER });
		await tick();
		await tick();

		expect(props.setSending).toHaveBeenCalledWith(false);
		const trueCallIdx = props.setSending.mock.calls.findIndex(([v]) => v === true);
		const falseCallIdx = props.setSending.mock.calls.findIndex(([v]) => v === false);
		expect(trueCallIdx).toBeLessThan(falseCallIdx);
	});
});
