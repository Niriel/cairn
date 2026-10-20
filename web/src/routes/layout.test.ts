import { createRawSnippet, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { page } from '$app/state';
import { bootSession, session } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import Layout from './+layout.svelte';

vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/shared/state/session.svelte');

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'dev' };

// Stub child snippet so tests can assert whether the layout rendered
// `{@render children()}` by querying for `data-test="layout-children"`.
// `createRawSnippet` matches the project convention for snippet stubs
// (see Accordion.test.ts, TopBar.test.ts, ButtonPair.test.ts).
const childStub = createRawSnippet(() => ({
	render: () => '<div data-test="layout-children"></div>'
}));

function setUrl(path: string) {
	// SvelteKit's generated `Pathname` union narrows `page.url.pathname`;
	// widening cast lets the test reset the URL via plain assignment.
	(page as { url: URL }).url = new URL(`http://localhost${path}`);
}

beforeEach(() => {
	session.current = { status: 'unknown' };
	setUrl('/');
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('+layout.svelte (auth guard)', () => {
	test('(a) calls bootSession() on mount', async () => {
		session.current = { status: 'unknown' };
		render(Layout, { children: childStub });
		await tick();
		expect(vi.mocked(bootSession)).toHaveBeenCalledTimes(1);
	});

	test('(b) renders boot screen when status is "unknown" (no children)', () => {
		session.current = { status: 'unknown' };
		const { queryByDataTest } = render(Layout, { children: childStub });
		expect(queryByDataTest('boot-screen')).not.toBeNull();
		expect(queryByDataTest('layout-children')).toBeNull();
	});

	test('(c) renders children when signed-in on a private path', async () => {
		session.current = { status: 'signed-in', user: SEED_USER };
		setUrl('/');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(queryByDataTest('layout-children')).not.toBeNull();
		expect(queryByDataTest('boot-screen')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(d) signed-out on a private path: redirects to /auth/signin and hides children', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/signin', { replaceState: true });
		expect(queryByDataTest('layout-children')).toBeNull();
	});

	test.each(['/auth/signin', '/auth/register', '/auth/forgot-password', '/auth/reset-password'])(
		'(e) signed-out on public path %s: children render, no redirect, no boot screen',
		async (path) => {
			session.current = { status: 'signed-out' };
			setUrl(path);
			const { queryByDataTest } = render(Layout, { children: childStub });
			await tick();
			expect(queryByDataTest('layout-children')).not.toBeNull();
			expect(queryByDataTest('boot-screen')).toBeNull();
			expect(vi.mocked(goto)).not.toHaveBeenCalled();
		}
	);

	test('(e2) signed-out on /imprint (public content path): children render, no redirect', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/imprint');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(queryByDataTest('layout-children')).not.toBeNull();
		expect(queryByDataTest('boot-screen')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e3) signed-out on /p/<id> (public list view): children render, no redirect', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/p/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(queryByDataTest('layout-children')).not.toBeNull();
		expect(queryByDataTest('boot-screen')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e4) signed-out on /about/privacy (legal page): children render, no redirect', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/about/privacy');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(queryByDataTest('layout-children')).not.toBeNull();
		expect(queryByDataTest('boot-screen')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e5) signed-out on /about (About hub): children render, no redirect', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/about');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(queryByDataTest('layout-children')).not.toBeNull();
		expect(queryByDataTest('boot-screen')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(f) signed-out on /auth/signinx (sibling-prefix): redirects (segment-anchored predicate)', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/auth/signinx');
		render(Layout, { children: childStub });
		await tick();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/signin', { replaceState: true });
	});

	test.each(['/auth/signin', '/auth/register', '/auth/forgot-password', '/auth/reset-password'])(
		'(g) signed-in on %s redirects to / with replaceState',
		async (path) => {
			session.current = { status: 'signed-in', user: SEED_USER };
			setUrl(path);
			render(Layout, { children: childStub });
			await tick();
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		}
	);

	test.each(['/auth/signin', '/auth/register', '/auth/forgot-password', '/auth/reset-password'])(
		'(h) signed-in on %s shows boot screen, hides children before redirect lands',
		(path) => {
			session.current = { status: 'signed-in', user: SEED_USER };
			setUrl(path);
			const { queryByDataTest } = render(Layout, { children: childStub });
			expect(queryByDataTest('boot-screen')).not.toBeNull();
			expect(queryByDataTest('layout-children')).toBeNull();
		}
	);

	test('(j) signed-in on a private path: children render, no boot screen, no redirect', async () => {
		session.current = { status: 'signed-in', user: SEED_USER };
		setUrl('/lists/123');
		const { queryByDataTest } = render(Layout, { children: childStub });
		await tick();
		expect(queryByDataTest('layout-children')).not.toBeNull();
		expect(queryByDataTest('boot-screen')).toBeNull();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(k) page.url reassignment re-fires the guard (mock reactivity)', async () => {
		session.current = { status: 'signed-out' };
		setUrl('/auth/signin');
		render(Layout, { children: childStub });
		await tick();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();

		setUrl('/private');
		await tick();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/auth/signin', { replaceState: true });
	});
});
