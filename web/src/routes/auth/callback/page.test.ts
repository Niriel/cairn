import { http, HttpResponse } from 'msw';
import { tick } from 'svelte';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { page } from '$app/state';
import { server } from '$lib/test/server';
import { render } from '$lib/test/render';
import { bootSession, session, setSignedIn } from '$lib/shared/state/session.svelte';

import Page from './+page.svelte';

vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/shared/state/session.svelte');

beforeAll(() => {
	vi.stubEnv('VITE_AUTH_BASE', '/auth');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

beforeEach(() => {
	session.current = { status: 'signed-out' };
});

afterEach(() => {
	vi.clearAllMocks();
});

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' };

function setCallbackUrl(query: string) {
	// SvelteKit's generated types narrow page.url.pathname to a union of
	// known routes; the test writes a plain URL via a widening cast.
	(page as { url: URL }).url = new URL(`http://localhost/auth/callback${query}`);
}

describe('/auth/callback', () => {
	test('(a) renders the loading state on mount', () => {
		setCallbackUrl('?token=abc&type=magiclink');
		const { getByDataTest } = render(Page);
		expect(getByDataTest('callback-loading')).not.toBeNull();
	});

	test('(b) POSTs /auth/verify with {token, type: "magiclink"}', async () => {
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/verify', async ({ request }) => {
				seenBody = await request.json();
				return HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				});
			})
		);
		setCallbackUrl('?token=tok-123&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(seenBody).toEqual({ token: 'tok-123', type: 'magiclink' });
		});
	});

	test('(c) on 200, calls setSignedIn(user) THEN goto("/", {replaceState: true})', async () => {
		server.use(
			http.post('*/auth/verify', () =>
				HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				})
			)
		);
		setCallbackUrl('?token=tok-123&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		});
		expect(vi.mocked(setSignedIn)).toHaveBeenCalledWith(SEED_USER);

		const setSignedInOrder = vi.mocked(setSignedIn).mock.invocationCallOrder[0];
		const gotoOrder = vi.mocked(goto).mock.invocationCallOrder[0];
		expect(setSignedInOrder).toBeLessThan(gotoOrder);
	});

	test('(d) on 401, renders error state with "Back to sign in" affordance; no setSignedIn, no goto', async () => {
		server.use(http.post('*/auth/verify', () => new HttpResponse(null, { status: 401 })));
		setCallbackUrl('?token=stale&type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e) on 503, renders error state; no setSignedIn, no goto', async () => {
		server.use(http.post('*/auth/verify', () => new HttpResponse(null, { status: 503 })));
		setCallbackUrl('?token=tok&type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(f) on network failure, renders error state; no setSignedIn, no goto', async () => {
		server.use(http.post('*/auth/verify', () => HttpResponse.error()));
		setCallbackUrl('?token=tok&type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(g) missing token: renders error state, does not call /auth/verify', async () => {
		const verifyHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/verify', verifyHandler));
		setCallbackUrl('?type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(verifyHandler).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(h) non-magiclink type (e.g. recovery): renders error state, does not call /auth/verify', async () => {
		const verifyHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/verify', verifyHandler));
		setCallbackUrl('?token=tok&type=recovery');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(verifyHandler).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(i) signed-in short-circuit at mount: goto("/") without calling /auth/verify', async () => {
		session.current = { status: 'signed-in', user: SEED_USER };
		const verifyHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/verify', verifyHandler));
		setCallbackUrl('?token=stale&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		});
		expect(verifyHandler).not.toHaveBeenCalled();
	});

	test('(j) boot-race short-circuit: bootSession resolves to signed-in mid-mount → goto, no /auth/verify', async () => {
		session.current = { status: 'unknown' };
		vi.mocked(bootSession).mockImplementationOnce(async () => {
			await tick();
			session.current = { status: 'signed-in', user: SEED_USER };
		});
		const verifyHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/verify', verifyHandler));
		setCallbackUrl('?token=stale&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		});
		expect(verifyHandler).not.toHaveBeenCalled();
	});
});
