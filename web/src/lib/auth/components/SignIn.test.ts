import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { HttpError, signIn } from '$lib/auth/model/auth-client';
import { setSignedIn } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import SignIn from './SignIn.svelte';

vi.mock('$lib/auth/model/auth-client');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
	vi.clearAllMocks();
});

describe('SignIn', () => {
	test('(a) renders username and password fields', () => {
		const { getByDataTest } = render(SignIn);
		expect(getByDataTest('signin-username')).toBeTruthy();
		expect(getByDataTest('signin-password')).toBeTruthy();
	});

	test('(b) submit disabled until both fields are non-empty', async () => {
		const { getByDataTest } = render(SignIn);
		const submit = getByDataTest('signin-submit') as HTMLButtonElement;
		const username = getByDataTest('signin-username') as HTMLInputElement;
		const password = getByDataTest('signin-password') as HTMLInputElement;
		expect(submit.disabled).toBe(true);

		await fireEvent.input(username, { target: { value: 'alice' } });
		expect(submit.disabled).toBe(true);

		await fireEvent.input(password, { target: { value: 'hunter2pw' } });
		expect(submit.disabled).toBe(false);
	});

	test('(c) submit calls signIn(username, password), adopts the session, navigates home', async () => {
		const { getByDataTest } = render(SignIn);
		const submit = getByDataTest('signin-submit') as HTMLButtonElement;
		await fireEvent.input(getByDataTest('signin-username'), { target: { value: 'alice' } });
		await fireEvent.input(getByDataTest('signin-password'), { target: { value: 'hunter2pw' } });
		await fireEvent.click(submit);
		await vi.waitFor(() => {
			expect(vi.mocked(signIn)).toHaveBeenCalledWith('alice', 'hunter2pw');
		});
		expect(vi.mocked(setSignedIn)).toHaveBeenCalled();
		expect(vi.mocked(goto)).toHaveBeenCalled();
	});

	test('(d) a thrown HttpError 401 renders the constant-shape inline error', async () => {
		vi.mocked(signIn).mockRejectedValueOnce(new HttpError(401, 'invalid credentials'));
		const { getByDataTest, queryByDataTest } = render(SignIn);
		await fireEvent.input(getByDataTest('signin-username'), { target: { value: 'alice' } });
		await fireEvent.input(getByDataTest('signin-password'), { target: { value: 'wrongpass' } });
		await fireEvent.click(getByDataTest('signin-submit'));
		await vi.waitFor(() => {
			expect(queryByDataTest('signin-error')).not.toBeNull();
		});
		expect(getByDataTest('signin-error').textContent).toContain('incorrect');
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
	});

	test('(e) links to the register screen', () => {
		const { getByDataTest } = render(SignIn);
		const link = getByDataTest('signin-register-link') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toContain('/auth/register');
	});

	test('(legal) shows the legal footer', () => {
		const { getByDataTest } = render(SignIn);
		expect(getByDataTest('signin-privacy-link')).toBeTruthy();
	});
});
