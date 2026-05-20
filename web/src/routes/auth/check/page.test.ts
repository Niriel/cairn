import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { page } from '$app/state';
import { pendingLogin } from '$lib/auth/state/pending-login.svelte';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/auth/state/pending-login.svelte');
vi.mock('$lib/auth/components/LoginCheck.svelte', async () => ({
	default: (await import('./LoginCheckStub.svelte')).default
}));

beforeEach(() => {
	pendingLogin.email = null;
	// SvelteKit's generated `Pathname` union narrows `page.url.pathname`;
	// the widening cast lets the test reset the URL via plain assignment.
	(page as { url: URL }).url = new URL('http://localhost/auth/check');
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('/auth/check', () => {
	test('(a) with pendingLogin.email set, renders LoginCheck with that email prop', () => {
		pendingLogin.email = 'alice@example.test';
		const { getByDataTest } = render(Page);
		const stub = getByDataTest('login-check-stub');
		expect(stub.getAttribute('data-test-email')).toBe('alice@example.test');
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(b) with pendingLogin.email null, redirects to /auth/login and renders nothing', () => {
		pendingLogin.email = null;
		const { queryByDataTest } = render(Page);
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/login', { replaceState: true });
		expect(queryByDataTest('login-check-stub')).toBeNull();
	});

	test('(c) ignores `?email=` in the URL — store is empty → still redirects, no email read from URL', () => {
		(page as { url: URL }).url = new URL('http://localhost/auth/check?email=alice@example.test');
		pendingLogin.email = null;
		const { queryByDataTest } = render(Page);
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/login', { replaceState: true });
		expect(queryByDataTest('login-check-stub')).toBeNull();
	});
});
