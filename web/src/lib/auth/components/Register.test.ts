import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { HttpError, register } from '$lib/auth/model/auth-client';
import { setSignedIn } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import Register from './Register.svelte';

vi.mock('$lib/auth/model/auth-client');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
	vi.clearAllMocks();
});

describe('Register', () => {
	test('(a) renders username and password fields', () => {
		const { getByDataTest } = render(Register);
		expect(getByDataTest('register-username')).toBeTruthy();
		expect(getByDataTest('register-password')).toBeTruthy();
	});

	test('(b) submit calls register(username, password), adopts the session, navigates home', async () => {
		const { getByDataTest } = render(Register);
		await fireEvent.input(getByDataTest('register-username'), { target: { value: 'alice' } });
		await fireEvent.input(getByDataTest('register-password'), { target: { value: 'hunter2pw' } });
		await fireEvent.click(getByDataTest('register-submit'));
		await vi.waitFor(() => {
			expect(vi.mocked(register)).toHaveBeenCalledWith('alice', 'hunter2pw');
		});
		expect(vi.mocked(setSignedIn)).toHaveBeenCalled();
		expect(vi.mocked(goto)).toHaveBeenCalled();
	});

	test('(c) a 409 renders the "username is taken" message', async () => {
		vi.mocked(register).mockRejectedValueOnce(new HttpError(409, 'username taken'));
		const { getByDataTest, queryByDataTest } = render(Register);
		await fireEvent.input(getByDataTest('register-username'), { target: { value: 'alice' } });
		await fireEvent.input(getByDataTest('register-password'), { target: { value: 'hunter2pw' } });
		await fireEvent.click(getByDataTest('register-submit'));
		await vi.waitFor(() => {
			expect(queryByDataTest('register-error')).not.toBeNull();
		});
		expect(getByDataTest('register-error').textContent).toContain('taken');
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
	});

	test('(d) a 400 renders a format/invalid message', async () => {
		vi.mocked(register).mockRejectedValueOnce(new HttpError(400, 'invalid'));
		const { getByDataTest, queryByDataTest } = render(Register);
		await fireEvent.input(getByDataTest('register-username'), { target: { value: 'ab' } });
		await fireEvent.input(getByDataTest('register-password'), { target: { value: 'hunter2pw' } });
		await fireEvent.click(getByDataTest('register-submit'));
		await vi.waitFor(() => {
			expect(queryByDataTest('register-error')).not.toBeNull();
		});
		// The 400 branch surfaces the format rule, distinct from the taken message.
		expect(getByDataTest('register-error').textContent).not.toContain('taken');
	});

	test('(e) links to the sign-in screen', () => {
		const { getByDataTest } = render(Register);
		const link = getByDataTest('register-signin-link') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toContain('/auth/signin');
	});
});
